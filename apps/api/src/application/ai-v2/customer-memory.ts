import { LoadedConversationStateV2 } from "./ai-v2.types";

/**
 * Builds a short text block for the renderer from summary + recent turns.
 * Does not call LLM — factual stitching only.
 */
export class CustomerMemoryV2 {
  static buildBrief(loaded: LoadedConversationStateV2): string {
    const parts: string[] = [];
    if (loaded.conversationSummary?.trim()) {
      parts.push(`ملخص سابق: ${loaded.conversationSummary.trim()}`);
    }
    if (loaded.recentTurnsText.length > 0) {
      parts.push(`آخر رسائل العميل: ${loaded.recentTurnsText.join(" | ")}`);
    }
    if (loaded.cartItemCount > 0) {
      parts.push(`سلة غير فارغة (${loaded.cartItemCount} بند).`);
    }
    return parts.length > 0 ? parts.join("\n") : "لا يوجد سياق سابق مضغوط.";
  }
}
