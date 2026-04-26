import { AiSalesState } from "./ai-v2.types";
import { ConversationContext } from "../../domain/entities/conversation.entity";

/**
 * Produces a partial conversation.context merge payload for v2 state only.
 */
export class StatePersisterV2 {
  static buildContextPatch(
    nextState: AiSalesState,
  ): Partial<ConversationContext> {
    return {
      aiV2: { ...nextState } as unknown as Record<string, unknown>,
    };
  }
}
