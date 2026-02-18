import { Module } from "@nestjs/common";
import { OpsAgent } from "./ops";
import { InventoryAgent } from "./inventory";
import { FinanceAgent } from "./finance";
import { MarketingAgent } from "./marketing";
import { ContentAgent } from "./content";
import { SupportAgent } from "./support";
import { LlmClientModule } from "../infrastructure/llm-client.module";

@Module({
  imports: [
    LlmClientModule, // Provides LLM client for AI-enhanced premium features
  ],
  providers: [
    OpsAgent,
    InventoryAgent,
    FinanceAgent,
    MarketingAgent,
    ContentAgent,
    SupportAgent,
  ],
  exports: [
    OpsAgent,
    InventoryAgent,
    FinanceAgent,
    MarketingAgent,
    ContentAgent,
    SupportAgent,
  ],
})
export class AgentsModule {}
