import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LlmService } from "./llm.service";
import { RepositoriesModule } from "../../infrastructure/repositories";

@Module({
  imports: [ConfigModule, RepositoriesModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
