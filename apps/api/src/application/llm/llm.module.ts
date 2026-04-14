import { Module } from "@nestjs/common";
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
import { MessageRouterService } from "./message-router.service";
import { PlannerContextAssemblerService } from "./planner-context-assembler.service";
import { CopilotActionRegistryService } from "./copilot-action-registry.service";
import { PlannerOrchestrationService } from "./planner-orchestration.service";
import { ControlPlaneGovernanceService } from "./control-plane-governance.service";
import { RepositoriesModule } from "../../infrastructure/repositories";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { SharedAiModule } from "../shared/shared-ai.module";

@Module({
  imports: [ConfigModule, DatabaseModule, RepositoriesModule, SharedAiModule],
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
    MessageRouterService,
    PlannerContextAssemblerService,
    CopilotActionRegistryService,
    PlannerOrchestrationService,
    ControlPlaneGovernanceService,
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
    MessageRouterService,
    PlannerContextAssemblerService,
    CopilotActionRegistryService,
    PlannerOrchestrationService,
    ControlPlaneGovernanceService,
  ],
})
export class LlmModule {}
