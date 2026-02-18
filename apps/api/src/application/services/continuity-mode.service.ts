import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../infrastructure/redis/redis.service";

export interface ContinuityState {
  isHealthy: boolean;
  degradedServices: string[];
  fallbackActive: boolean;
  lastHealthCheck: Date;
}

export interface FallbackResponse {
  reply: string;
  action: "acknowledge" | "queue" | "escalate";
  reason: string;
}

/**
 * Continuity Mode Service
 * Provides graceful degradation when external services (LLM, Redis, etc.) fail.
 * Ensures customers always get a response even during outages.
 */
@Injectable()
export class ContinuityModeService {
  private readonly logger = new Logger(ContinuityModeService.name);
  private state: ContinuityState = {
    isHealthy: true,
    degradedServices: [],
    fallbackActive: false,
    lastHealthCheck: new Date(),
  };

  // Fallback response templates in Arabic
  private readonly FALLBACK_RESPONSES = {
    llm_down:
      "شكراً لرسالتك! حصل مشكلة تقنية بسيطة عندنا. هيتواصل معاك حد من فريقنا في أقرب وقت 🙏",
    high_load: "شكراً لصبرك! عندنا ضغط شوية دلوقتي. هنرد عليك في خلال دقايق ⏰",
    maintenance: "عندنا صيانة بسيطة دلوقتي. هنرجعلك تاني قريب جداً 🔧",
    timeout: "وصلتنا رسالتك! محتاجين دقيقة واحدة ونرد عليك 👍",
    generic: "شكراً لتواصلك معانا! هنرد عليك في أقرب وقت ممكن 💬",
  };

  // Queue for messages received during degraded mode
  private messageQueue: Array<{
    conversationId: string;
    merchantId: string;
    messageText: string;
    receivedAt: Date;
  }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check if system is in continuity/fallback mode
   */
  isInFallbackMode(): boolean {
    return this.state.fallbackActive;
  }

  /**
   * Get current system health state
   */
  getState(): ContinuityState {
    return { ...this.state };
  }

  /**
   * Report a service as degraded
   */
  reportServiceDegraded(serviceName: string, reason?: string): void {
    if (!this.state.degradedServices.includes(serviceName)) {
      this.state.degradedServices.push(serviceName);
      this.state.isHealthy = false;

      this.logger.warn({
        msg: "Service reported as degraded",
        service: serviceName,
        reason,
        degradedServices: this.state.degradedServices,
      });

      // Activate fallback if critical service is down
      if (["llm", "database", "redis"].includes(serviceName.toLowerCase())) {
        this.activateFallbackMode(reason || `${serviceName} unavailable`);
      }
    }
  }

  /**
   * Report a service as recovered
   */
  reportServiceRecovered(serviceName: string): void {
    const index = this.state.degradedServices.indexOf(serviceName);
    if (index > -1) {
      this.state.degradedServices.splice(index, 1);

      this.logger.log({
        msg: "Service recovered",
        service: serviceName,
        remainingDegraded: this.state.degradedServices,
      });

      // Check if we can deactivate fallback mode
      if (this.state.degradedServices.length === 0) {
        this.deactivateFallbackMode();
      }
    }
  }

  /**
   * Activate fallback mode
   */
  activateFallbackMode(reason: string): void {
    if (!this.state.fallbackActive) {
      this.state.fallbackActive = true;

      this.logger.warn({
        msg: "Fallback mode ACTIVATED",
        reason,
        degradedServices: this.state.degradedServices,
      });

      // Try to persist state to Redis if available
      this.persistState().catch(() => {
        // Redis might be down too, that's okay
      });
    }
  }

  /**
   * Deactivate fallback mode and process queued messages
   */
  async deactivateFallbackMode(): Promise<void> {
    if (this.state.fallbackActive) {
      this.state.fallbackActive = false;
      this.state.isHealthy = true;

      this.logger.log({
        msg: "Fallback mode DEACTIVATED",
        queuedMessages: this.messageQueue.length,
      });

      // Process queued messages (would emit events for reprocessing)
      await this.drainMessageQueue();
    }
  }

  /**
   * Get appropriate fallback response based on degradation type
   */
  getFallbackResponse(
    degradationType: keyof typeof this.FALLBACK_RESPONSES = "generic",
    customMessage?: string,
  ): FallbackResponse {
    const reply = customMessage || this.FALLBACK_RESPONSES[degradationType];

    let action: FallbackResponse["action"] = "acknowledge";

    // Determine action based on degradation severity
    if (degradationType === "llm_down" || degradationType === "maintenance") {
      action = "escalate"; // Need human attention
    } else if (
      degradationType === "high_load" ||
      degradationType === "timeout"
    ) {
      action = "queue"; // Can retry later
    }

    return {
      reply,
      action,
      reason: degradationType,
    };
  }

  /**
   * Queue a message for later processing during degraded mode
   */
  queueMessage(
    conversationId: string,
    merchantId: string,
    messageText: string,
  ): void {
    this.messageQueue.push({
      conversationId,
      merchantId,
      messageText,
      receivedAt: new Date(),
    });

    this.logger.log({
      msg: "Message queued for later processing",
      conversationId,
      queueSize: this.messageQueue.length,
    });

    // Limit queue size to prevent memory issues
    if (this.messageQueue.length > 1000) {
      const dropped = this.messageQueue.shift();
      this.logger.warn({
        msg: "Dropped oldest queued message (queue full)",
        droppedConversationId: dropped?.conversationId,
      });
    }
  }

  /**
   * Process queued messages after recovery
   */
  private async drainMessageQueue(): Promise<void> {
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    this.logger.log({
      msg: "Draining message queue",
      count: messages.length,
    });

    // In production, emit events to reprocess these messages
    for (const msg of messages) {
      this.logger.debug({
        msg: "Would reprocess queued message",
        conversationId: msg.conversationId,
        age: Date.now() - msg.receivedAt.getTime(),
      });
      // Could emit an event here for the inbox service to reprocess
    }
  }

  /**
   * Persist current state to Redis for cluster-wide awareness
   */
  private async persistState(): Promise<void> {
    try {
      await this.redisService.set(
        "continuity:state",
        JSON.stringify(this.state),
        300, // 5 minute TTL
      );
    } catch (error) {
      // Redis might be down, ignore
    }
  }

  /**
   * Load state from Redis (for new instances)
   */
  async loadState(): Promise<void> {
    try {
      const stored = await this.redisService.get("continuity:state");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = {
          ...parsed,
          lastHealthCheck: new Date(parsed.lastHealthCheck),
        };

        this.logger.log({
          msg: "Loaded continuity state from Redis",
          state: this.state,
        });
      }
    } catch (error) {
      // Redis might be down or no state stored
    }
  }

  /**
   * Perform health check on critical services
   */
  async performHealthCheck(): Promise<ContinuityState> {
    this.state.lastHealthCheck = new Date();

    // Check Redis
    try {
      await this.redisService.set("health:ping", "pong", 10);
      this.reportServiceRecovered("redis");
    } catch {
      this.reportServiceDegraded("redis", "Connection failed");
    }

    return this.getState();
  }

  /**
   * Wrap an async operation with continuity fallback
   */
  async withFallback<T>(
    operation: () => Promise<T>,
    fallbackValue: T,
    serviceName: string,
  ): Promise<T> {
    try {
      const result = await operation();
      this.reportServiceRecovered(serviceName);
      return result;
    } catch (error) {
      this.reportServiceDegraded(serviceName, (error as Error).message);

      this.logger.warn({
        msg: "Operation failed, using fallback",
        service: serviceName,
        error: (error as Error).message,
      });

      return fallbackValue;
    }
  }
}
