import { Module } from "@nestjs/common";
import { OutboxPollerService } from "./outbox-poller.service";

@Module({
  providers: [OutboxPollerService],
  exports: [OutboxPollerService],
})
export class OutboxModule {}
