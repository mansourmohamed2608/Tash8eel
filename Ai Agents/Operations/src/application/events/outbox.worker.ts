import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { EventHandlerRegistry } from './event-handler.registry';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private isProcessing = false;
  private readonly lockKey = 'outbox-worker-lock';
  private readonly lockTtl = 30000; // 30 seconds

  constructor(
    private readonly outboxService: OutboxService,
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Process outbox events every 5 seconds
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Outbox processing already in progress, skipping');
      return;
    }

    // Try to acquire distributed lock
    const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
    if (!lock) {
      this.logger.debug('Could not acquire outbox lock, another instance is processing');
      return;
    }

    this.isProcessing = true;

    try {
      const events = await this.outboxService.fetchPendingEvents(50);
      
      if (events.length === 0) {
        return;
      }

      this.logger.log({
        msg: 'Processing outbox events',
        count: events.length,
      });

      for (const event of events) {
        try {
          // Get handler for event type
          const handler = this.eventHandlerRegistry.getHandler(event.eventType);
          
          if (handler) {
            await handler.handle(event);
            this.logger.debug({
              msg: 'Event handled successfully',
              eventId: event.id,
              eventType: event.eventType,
            });
          } else {
            this.logger.warn({
              msg: 'No handler registered for event type',
              eventId: event.id,
              eventType: event.eventType,
            });
          }

          // Mark as processed
          await this.outboxService.markProcessed(event.id);
        } catch (error: any) {
          this.logger.error({
            msg: 'Failed to process event',
            eventId: event.id,
            eventType: event.eventType,
            error: error.message,
          });

          // Mark as failed (will move to DLQ after 5 retries)
          await this.outboxService.markFailed(event.id, error.message);
        }
      }
    } catch (error: any) {
      this.logger.error({
        msg: 'Error in outbox worker',
        error: error.message,
      });
    } finally {
      this.isProcessing = false;
      await this.redisService.releaseLock(lock);
    }
  }

  /**
   * Get processing status
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}
