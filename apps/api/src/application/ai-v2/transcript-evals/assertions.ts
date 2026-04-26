import { SalesStageV2 } from "../ai-v2.types";

const PAYMENT_RE =
  /(?:طريقة\s+(?:الدفع|السداد)|تدفع\s+(?:إزاي|ازاي)|payment\s+(?:method|type)|how\s+(?:will|would)\s+you\s+pay)/iu;
const DELIVERY_RE =
  /(?:عنوانك?|عنوان\s+التوصيل|delivery\s+(?:address|location)|deliver\s+to)/iu;
const INTERNAL_MARKERS =
  /\[internal\]|visibility:\s*internal|INTERNAL_ONLY|staff_only/i;

export function maxOneQuestion(text: string): boolean {
  const questions = text.match(/[؟?]/g) || [];
  return questions.length <= 1;
}

export function noPaymentKeywordsUnlessStage(
  stage: SalesStageV2,
  text: string,
): boolean {
  if (stage === "checkout") return true;
  return !PAYMENT_RE.test(text);
}

export function noDeliveryKeywordsUnlessStage(
  stage: SalesStageV2,
  text: string,
): boolean {
  if (stage === "order_draft" || stage === "checkout") return true;
  return !DELIVERY_RE.test(text);
}

export function noInternalKbMarkers(text: string): boolean {
  return !INTERNAL_MARKERS.test(text);
}

export function empathyIfComplaint(
  userContainsComplaint: boolean,
  reply: string,
): boolean {
  if (!userContainsComplaint) return true;
  return /حقك|معلش|اسف|آسف|فاهم|معاك|خليني|هن|أسفين/i.test(reply.slice(0, 120));
}

export function greetingNoAggressiveCatalogPitch(
  isGreetingScenario: boolean,
  reply: string,
): boolean {
  if (!isGreetingScenario) return true;
  const bullets = (reply.match(/•|·|\n-/g) || []).length;
  return bullets < 4 && reply.length < 500;
}
