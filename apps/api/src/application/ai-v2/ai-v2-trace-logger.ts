import { Logger } from "@nestjs/common";
import { ToolActionResultV2 } from "./ai-v2.types";

export interface AiV2TraceEvent {
  correlationId?: string;
  merchantId: string;
  conversationId: string;
  messageId?: string;
  aiReplyEngine?: string;
  localTestMode: boolean;
  usedOpenAI: {
    understanding: boolean;
    renderer: boolean;
  };
  understanding?: {
    domain?: string;
    intentTags?: string[];
  };
  stageBefore?: string;
  stageAfter?: string;
  nextBestAction?: string;
  toolResults?: ToolActionResultV2[];
  activeQuestionKind?: string | null;
  selectedItemsCount?: number;
  orderDraft?: { status?: string; missingFieldsCount?: number } | null;
  complaintState?: { status?: string } | null;
  merchantFactIds?: string[];
  ragCounts?: { catalogFacts: number; kbFacts: number };
  validationFailures?: string[];
  fallbackUsed?: boolean;
  understandingError?: { code?: string; message?: string };
  rendererError?: { code?: string; message?: string };
  tokensUsed?: number;
  latencyMs?: number;
}

export class AiV2TraceLogger {
  private static readonly logger = new Logger("AiV2Trace");

  static logTurn(event: AiV2TraceEvent) {
    const verbose =
      String(process.env.AI_V2_TRACE_VERBOSE || "").toLowerCase() === "true";
    const safe = {
      correlationId: event.correlationId,
      merchantId: event.merchantId,
      conversationId: event.conversationId,
      messageId: event.messageId,
      aiReplyEngine: event.aiReplyEngine,
      localTestMode: event.localTestMode,
      usedOpenAI: event.usedOpenAI,
      understanding: {
        domain: event.understanding?.domain,
        intentTags: (event.understanding?.intentTags || []).slice(0, 12),
      },
      stageBefore: event.stageBefore,
      stageAfter: event.stageAfter,
      nextBestAction: event.nextBestAction,
      toolActions: (event.toolResults || []).map((result) => ({
        actionName: result.actionName,
        available: result.available,
        attempted: result.attempted,
        success: result.success,
        errorCode: result.errorCode,
      })),
      activeQuestionKind: event.activeQuestionKind,
      selectedItemsCount: event.selectedItemsCount,
      orderDraft: event.orderDraft,
      complaintState: event.complaintState,
      merchantFactIds: (event.merchantFactIds || []).slice(0, 20),
      ragCounts: event.ragCounts,
      validationFailures: event.validationFailures?.slice(0, 12) || [],
      fallbackUsed: event.fallbackUsed,
      tokensUsed: event.tokensUsed,
      latencyMs: event.latencyMs,
      ...(verbose
        ? {
            understandingError: event.understandingError,
            rendererError: event.rendererError,
          }
        : {}),
    };
    this.logger.log(safe);
  }
}
