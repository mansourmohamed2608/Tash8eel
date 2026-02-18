import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { EventsModule } from "../events/events.module";
import { DlqService } from "./dlq.service";

@Module({
  imports: [DatabaseModule, EventsModule],
  providers: [DlqService],
  exports: [DlqService],
})
export class DlqModule {}
