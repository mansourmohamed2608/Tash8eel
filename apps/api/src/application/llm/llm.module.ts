import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LlmService } from "./llm.service";
import { InventoryAiService } from "./inventory-ai.service";
import { OpsAiService } from "./ops-ai.service";
import { FinanceAiService } from "./finance-ai.service";
import { VisionService } from "./vision.service";
import { MerchantAssistantService } from "./merchant-assistant.service";
import { CopilotAiService } from "./copilot-ai.service";
import { CopilotDispatcherService } from "./copilot-dispatcher.service";
import { MerchantContextService } from "./merchant-context.service";
import { EmbeddingService } from "./embedding.service";
import { VectorSearchService } from "./vector-search.service";
import { RepositoriesModule } from "../../infrastructure/repositories";
import { ServicesModule } from "../services/services.module";
import { DatabaseModule } from "../../infrastructure/database/database.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RepositoriesModule,
    forwardRef(() => ServicesModule),
  ],
  providers: [
    LlmService,
    InventoryAiService,
    OpsAiService,
    FinanceAiService,
    VisionService,
    MerchantAssistantService,
    CopilotAiService,
    CopilotDispatcherService,
    MerchantContextService,
    EmbeddingService,
    VectorSearchService,
  ],
  exports: [
    LlmService,
    InventoryAiService,
    OpsAiService,
    FinanceAiService,
    VisionService,
    MerchantAssistantService,
    CopilotAiService,
    CopilotDispatcherService,
    MerchantContextService,
    EmbeddingService,
    VectorSearchService,
  ],
})
export class LlmModule {}
