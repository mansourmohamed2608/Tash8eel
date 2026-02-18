import { Module } from "@nestjs/common";
import {
  InboxController,
  MerchantsController,
  CatalogController,
  ConversationsController,
  OrdersController,
  AdminController,
} from "./controllers";

// Infrastructure imports
import { DatabaseModule } from "../infrastructure/database/database.module";
import { RepositoriesModule } from "../infrastructure/repositories/repositories.module";

// Application imports
import { LlmModule } from "../application/llm/llm.module";
import { EventsModule } from "../application/events/events.module";
import { DlqModule } from "../application/dlq/dlq.module";
import { AdaptersModule } from "../application/adapters/adapters.module";
import { InboxService } from "../application/services/inbox.service";

@Module({
  imports: [
    DatabaseModule,
    RepositoriesModule,
    LlmModule,
    EventsModule,
    DlqModule,
    AdaptersModule,
  ],
  controllers: [
    InboxController,
    MerchantsController,
    CatalogController,
    ConversationsController,
    OrdersController,
    AdminController,
  ],
  providers: [InboxService],
})
export class ApiModule {}
