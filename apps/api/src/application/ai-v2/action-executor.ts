import { Injectable, Logger } from "@nestjs/common";
import {
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionResultV2,
} from "./ai-v2.types";
import { ToolRegistryV2 } from "./tool-registry";

@Injectable()
export class ActionExecutorV2 {
  private readonly logger = new Logger(ActionExecutorV2.name);

  constructor(private readonly registry: ToolRegistryV2) {}

  async execute(input: {
    runtimeContext: RuntimeContextV2;
    plan: ReplyPlanV2;
  }): Promise<ToolActionResultV2[]> {
    const results: ToolActionResultV2[] = [];
    for (const action of input.plan.toolActions) {
      try {
        const result = await this.registry.execute({
          actionName: action.actionName,
          runtimeContext: input.runtimeContext,
        });
        results.push(result);
      } catch (error: any) {
        this.logger.warn({
          msg: "ai_v2_tool_action_failed",
          actionName: action.actionName,
          name: String(error?.name || "Error"),
          code: error?.code ? String(error.code) : undefined,
        });
        results.push({
          actionName: action.actionName,
          available: true,
          attempted: true,
          success: false,
          resultFactIds: [],
          safeMessage:
            "I could not complete that backend action right now. I can keep collecting the needed details safely.",
          errorCode: "TOOL_EXECUTION_FAILED",
        });
      }
    }
    return results;
  }
}
