import { Merchant } from "../../domain/entities/merchant.entity";

/**
 * Global env AI_REPLY_ENGINE=v1|v2 (default v1).
 * Merchant override: merchant.config.aiReplyEngine = "v2"
 */
export function shouldUseAiReplyEngineV2(
  merchant: Merchant,
  envValue: string | undefined,
): boolean {
  const normalized = String(envValue || "v1")
    .trim()
    .toLowerCase();
  const config = (merchant.config || {}) as Record<string, unknown>;
  const merchantFlag = String(config.aiReplyEngine || "")
    .trim()
    .toLowerCase();
  if (merchantFlag === "v2") return true;
  if (merchantFlag === "v1") return false;
  return normalized === "v2";
}
