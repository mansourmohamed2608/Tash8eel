import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LlmModule } from "../llm/llm.module";
import { AiV2Service } from "./ai-v2.service";
import { RagContextBuilderServiceV2 } from "./rag-context-builder.service";
import { ReplyRendererServiceV2 } from "./reply-renderer.service";
import { MessageUnderstandingV2Service } from "./message-understanding";

@Module({
  imports: [ConfigModule, LlmModule],
  providers: [
    AiV2Service,
    RagContextBuilderServiceV2,
    ReplyRendererServiceV2,
    MessageUnderstandingV2Service,
  ],
  exports: [AiV2Service],
})
export class AiV2Module {}
