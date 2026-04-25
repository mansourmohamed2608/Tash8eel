import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import {
  LlmContext,
  LlmResult,
  LLMCallOptions,
  LlmService,
} from "../llm/llm.service";
import { ActionType } from "../../shared/constants/enums";
import { ConversationContext } from "../../domain/entities/conversation.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { OutboundMediaAttachment } from "../adapters/channel.adapter.interface";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { IntentClassification, IntentClassifier } from "./intent-classifier";
import { ConstraintNegotiator } from "./constraint-negotiator";
import { DeEscalator } from "./de-escalator";
import { DialogPlaybookService, MerchantSalesPlaybook } from "./dialog-playbook.service";
import { MediaComposer } from "./media-composer";
import { ReplyIntent } from "./reply-composer";
import { SlotPlan } from "./slot-plan";
import { OptionExtractor } from "./option-extractor";
import { ShortReplyResolver, ShortReplyResolution } from "./short-reply-resolver";
import { SalesStageAdvancer, SalesStage } from "./sales-stage-advancer";

export interface DialogTurnResult {
  replyText: string;
  llmResult: LlmResult;
  mediaAttachments: OutboundMediaAttachment[];
  contextPatch: Partial<ConversationContext>;
  routingDecision: "ai_4o_mini" | "ai_4o_mini_degraded" | "offtopic_ai_redirect";
}

@Injectable()
export class DialogOrchestrator {
  constructor(
    private readonly llmService: LlmService,
    private readonly playbookService: DialogPlaybookService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async processTurn(
    context: LlmContext,
    options: LLMCallOptions | undefined,
    input: {
      channel?: "whatsapp" | "messenger" | "instagram";
      degraded?: boolean;
      offTopicRedirectMode?: boolean;
    } = {},
  ): Promise<DialogTurnResult> {
    const classification = IntentClassifier.classify(context.customerMessage);
    const playbook = await this.playbookService.getForMerchant(
      context.merchant.id,
    );
    const previousDialog = ((context.conversation.context || {}).dialog || {}) as Record<string, any>;
    const turnMemory = context.turnMemory;

    // Resolve short reply using previous turn's context
    const shortReply = ShortReplyResolver.resolve(context.customerMessage, {
      pendingSlot: previousDialog.pendingSlot ?? null,
      pendingQuestionType: previousDialog.pendingQuestionType ?? null,
      lastOfferedOptions: previousDialog.lastOfferedOptions ?? null,
      lastRecommendation: previousDialog.lastRecommendation ?? null,
      lastProposal: previousDialog.lastProposal ?? null,
    });
    // Deterministically patch slots from unambiguous short-reply resolutions
    // (e.g. numeric → quantity, location → delivery_area, date → deadline)
    const shortReplySlotPatch = this.resolveShortReplySlots(
      shortReply,
      previousDialog,
    );
    const llmExtracted = turnMemory?.universalSlots;
    const filledSlots: Record<string, unknown> = {
      ...(previousDialog.filledSlots || {}),
      // Short-reply slot values are injected before LLM extraction so they
      // appear in answeredSlots and the memory brief (preventing re-asking).
      ...shortReplySlotPatch,
      ...(llmExtracted && Object.keys(llmExtracted).length > 0
        ? llmExtracted
        : this.extractFilledSlots(context.customerMessage)),
    };
    const slotPlan = SlotPlan.chooseNext({
      slotGraph: playbook.slotGraph,
      filledSlots,
      lastAskedFor: previousDialog.lastQuestion || null,
    });

    const cartItems = context.conversation.cart?.items || [];
    const salesStage: SalesStage = SalesStageAdvancer.advance({
      currentIntent: classification.intent,
      customerMessage: context.customerMessage,
      filledSlots,
      lastOfferedOptions: previousDialog.lastOfferedOptions ?? [],
      lastQuotedItems: previousDialog.lastQuotedItems ?? [],
      lastRecommendation: previousDialog.lastRecommendation,
      lastProposal: previousDialog.lastProposal,
      cartItemCount: cartItems.length,
      requiresConfirmation: context.conversation.requiresConfirmation,
      lastActionType: (context.conversation.context?.lastActionType as string | undefined) ?? undefined,
    });

    const mediaAttachments = await MediaComposer.compose({
      pool: this.pool,
      merchantId: context.merchant.id,
      channel: input.channel,
      customerMessage: context.customerMessage,
      catalogItems: context.catalogItems,
    });

    const constraintPlan = ConstraintNegotiator.plan(
      context.customerMessage,
      context.merchant,
    );
    const escalationPlan = DeEscalator.plan(
      context.customerMessage,
      context.merchant,
    );
    const shortReplyFacts = this.buildShortReplyFacts(
      shortReply,
      previousDialog,
      shortReplySlotPatch,
    );
    const replyIntent = this.buildReplyIntent({
      classification,
      playbook,
      slotPlan,
      context,
      mediaAttachments,
      constraintPlan,
      escalationPlan,
      shortReplyFacts,
      salesStage,
    });
    const stageMaxTokens = this.getStageMaxTokens(salesStage);
    const dialogOptions: LLMCallOptions = options
      ? { ...options, maxTokens: Math.max(options.maxTokens || 0, stageMaxTokens) }
      : { maxTokens: stageMaxTokens };
    const dialogResult = await this.llmService.processDialogTurn(
      context,
      replyIntent,
      dialogOptions,
    );
    const gatedResult = this.gateCommerceAction(
      dialogResult,
      classification,
      context,
    );
    gatedResult.response = {
      ...gatedResult.response,
      reasoning: [
        gatedResult.response.reasoning,
        `dialog_orchestrator:${classification.intent}`,
      ]
        .filter(Boolean)
        .join("|"),
    };

    const replyText = gatedResult.response.reply_ar;
    const offeredOptions = OptionExtractor.extractOfferedOptions(replyText);
    const pendingQType = OptionExtractor.detectPendingQuestionType(replyText);
    const pendingSlotFromReply = OptionExtractor.detectPendingSlot(replyText);
    const lastProposalFromReply = OptionExtractor.extractLastProposal(replyText);

    // Carry forward selection from short-reply resolver if ordinal/all
    const lastCustomerSelection =
      shortReply.type === "ordinal_selection" && shortReply.resolvedValue
        ? String(shortReply.resolvedValue)
        : shortReply.type === "selecting_all_options" && shortReply.resolvedOptions?.length
          ? shortReply.resolvedOptions.join(" + ")
          : previousDialog.lastCustomerSelection;

    return {
      replyText,
      llmResult: gatedResult,
      mediaAttachments,
      contextPatch: {
        lastIntent: classification.intent,
        lastActionType: gatedResult.action,
        ...(turnMemory?.businessType
          ? { businessType: turnMemory.businessType }
          : {}),
        ...(turnMemory?.businessTypeConfidence !== undefined
          ? { businessTypeConfidence: turnMemory.businessTypeConfidence }
          : {}),
        ...(turnMemory
          ? {
              customSlots: turnMemory.customSlots,
              slotConfidence: turnMemory.slotConfidence,
            }
          : {}),
        dialog: {
          lastIntent: classification.intent,
          filledSlots,
          askedSlots: this.appendUnique(
            previousDialog.askedSlots || [],
            slotPlan.nextSlot,
          ),
          answeredSlots: this.computeAnsweredSlots(
            previousDialog.answeredSlots || [],
            filledSlots,
          ),
          lastQuestion: slotPlan.nextSlot || previousDialog.lastQuestion,
          lastMediaItemIds:
            mediaAttachments.length > 0
              ? mediaAttachments.map((item) => item.url)
              : previousDialog.lastMediaItemIds || [],
          lastDecision: gatedResult.response.reasoning || classification.intent,
          // Short-reply context: extracted from this turn's reply for the next turn
          lastOfferedOptions: offeredOptions.length > 0
            ? offeredOptions
            : previousDialog.lastOfferedOptions || [],
          pendingQuestionType: pendingQType || previousDialog.pendingQuestionType,
          pendingSlot: pendingSlotFromReply || slotPlan.nextSlot || previousDialog.pendingSlot,
          lastProposal: lastProposalFromReply || previousDialog.lastProposal,
          lastRecommendation: previousDialog.lastRecommendation,
          lastCustomerSelection,
          lastQuotedItems: previousDialog.lastQuotedItems,
          salesStage,
        },
      },
      routingDecision: input.degraded
        ? "ai_4o_mini_degraded"
        : input.offTopicRedirectMode
          ? "offtopic_ai_redirect"
          : "ai_4o_mini",
    };
  }

  private buildReplyIntent(input: {
    classification: IntentClassification;
    playbook: MerchantSalesPlaybook;
    slotPlan: ReturnType<typeof SlotPlan.chooseNext>;
    context: LlmContext;
    mediaAttachments: OutboundMediaAttachment[];
    constraintPlan: ReturnType<typeof ConstraintNegotiator.plan>;
    escalationPlan: ReturnType<typeof DeEscalator.plan>;
    shortReplyFacts?: string[];
    salesStage: SalesStage;
  }): ReplyIntent {
    const candidateItems = this.findMentionedCatalogItems(
      input.context.customerMessage,
      input.context.catalogItems,
    );
    const constraintAxes = input.constraintPlan?.axisLabelsAr || [];
    const isEscalationLike =
      input.escalationPlan.hasComplaint || input.escalationPlan.hasHumanDemand;
    const isPolicyLike = this.isPolicyQuestion(input.context.customerMessage);
    // Short-reply intents are answering an existing question — do NOT suppress slot questions
    const isEarlyHumanIntent = new Set([
      "greeting",
      "browsing",
      "media_request",
      "custom_request",
      "asking_question",
      "infeasible_request",
      "off_topic",
    ]).has(input.classification.intent);
    const shouldSuppressSlotQuestion =
      constraintAxes.length > 0 ||
      isEscalationLike ||
      isPolicyLike ||
      isEarlyHumanIntent;
    const nextSlot = shouldSuppressSlotQuestion
      ? null
      : input.slotPlan.nextSlot;
    const stageInstruction = SalesStageAdvancer.getStageInstructionAr(input.salesStage);
    const stageReplyStructure = this.getStageReplyStructure(input.salesStage);
    const answerFacts = [
      // Sales stage instruction — always first, governs the AI's closing posture
      `[SALES_STAGE: ${input.salesStage}] ${stageInstruction}`,
      ...(stageReplyStructure ? [`[REPLY_STRUCTURE] ${stageReplyStructure}`] : []),
      `Intent: ${input.classification.intent}. Treat this as the controlling intent unless the customer explicitly confirms a purchase.`,
      "Do not collect address, payment, or quantity unless the customer has clearly chosen/bought/confirmed a specific item or order.",
      // Inject short-reply facts (context note + resolved slot + do-not-repeat)
      ...(input.shortReplyFacts || []),
      ...(input.classification.intent === "greeting"
        ? [
            "Goal: greet naturally as the merchant team. Do not interpret the greeting as a product request. Do not ask quantity, address, or payment.",
          ]
        : []),
      ...(input.classification.intent === "browsing"
        ? [
            "Goal: guided selling. Acknowledge that the customer is unsure, offer useful direction, and ask one easy preference question. Do not ask for a product name as a prerequisite.",
          ]
        : []),
      ...(input.classification.intent === "media_request"
        ? [
            "Goal: confirm that the requested product photos are attached. Do not ask quantity, address, or payment in the same turn.",
          ]
        : []),
      ...(input.classification.intent === "custom_request"
        ? [
            "Goal: treat the message as a custom brief. Acknowledge the idea and ask for one missing spec. Do not force-fit to a catalog item or ask quantity unless quantity is naturally required.",
          ]
        : []),
      ...(input.classification.intent === "infeasible_request"
        ? [
            "Goal: name the conflicting constraints and ask which one can flex. Do not hand off and do not suggest a random catalog substitute.",
          ]
        : []),
      ...(input.classification.intent === "selecting_all_options"
        ? [
            "Goal: customer wants ALL recently offered options. Do NOT re-ask the choice question. Compare/continue with all options and ask ONE useful next question only.",
          ]
        : []),
      ...(input.classification.intent === "ordinal_selection"
        ? [
            "Goal: customer selected a specific option by position. Store the selection and continue from that option. Do not re-ask which option they want.",
          ]
        : []),
      ...(input.classification.intent === "affirmative"
        ? [
            "Goal: customer agrees with the last proposal/question. Proceed to the next useful step without restarting qualification or repeating already-answered questions.",
          ]
        : []),
      ...(input.classification.intent === "negative_reply"
        ? [
            "Goal: customer rejected the last proposal. Offer one alternative or ask one narrow clarifying question. Keep the current business context.",
          ]
        : []),
      ...(isPolicyLike
        ? [
            "هدف الرد: طمّن العميل أن الاسترجاع/الاستبدال له سياسة واضحة، اذكر المتاح من سياسة المتجر بدون اختراع، ثم اعرض عليه نكمل على طلب موجود لو عنده طلب فعلاً. لا تطلب اسم المنتج كشرط أولي.",
          ]
        : []),
      ...(isEscalationLike
        ? [
            "هدف الرد: العميل متضايق أو طالب شخص مسؤول؛ ابدأ بتعاطف حقيقي قصير ورد كأنك الشخص الموجود معه الآن. اسأله يحكي ما حدث تحديداً. ممنوع وعد التحويل لشخص آخر.",
          ]
        : []),
      ...(constraintAxes.length > 0
        ? [
            `هدف الرد: في الطلب قيود متعارضة: ${constraintAxes.join("، ")}. سمها ببساطة واسأل العميل أي قيد ممكن نلينه أو نعدله قبل اقتراح بديل.`,
          ]
        : []),
      ...candidateItems.slice(0, 3).map((item) =>
        `${item.nameAr}: ${item.basePrice} ${input.context.merchant.currency || "EGP"}`,
      ),
      ...input.mediaAttachments
        .slice(0, 3)
        .map((item) => item.caption || item.fallbackText)
        .filter((value): value is string => !!value),
    ];
    const promptSeed = nextSlot
      ? input.playbook.nextQuestionTemplates[nextSlot]
      : undefined;
    const nextQuestion = constraintAxes.length
      ? `هدف السؤال: نعرف أي قيد من هذه القيود يمكن تعديله: ${constraintAxes.join("، ")}`
      : isEscalationLike
        ? "هدف السؤال: خلي العميل يحكي ما حدث تحديداً حتى تتصرف معه كالشخص الموجود في الشات"
        : isPolicyLike
          ? "هدف السؤال: لو عنده طلب موجود، اعرض عليه يكمل الاسترجاع أو الاستبدال بإرسال رقم الطلب أو صورة المنتج"
          : promptSeed;

    return {
      intent: input.classification.intent,
      answerFacts,
      mediaWillBeAttached: input.mediaAttachments.length > 0,
      constraintAxes,
      slotPlan: {
        nextSlot,
        promptSeed,
      },
      nextQuestion,
      forbiddenClaims: [
        "do not mention AI or bot",
        "do not invent a human transfer",
        "do not say a specialist, manager, colleague, or team will contact the customer unless agent availability explicitly allows it",
        "do not ask for quantity, address, or payment during greeting, media request, policy, guided choice, complaint, off-topic, or infeasible turns",
        ...(input.escalationPlan.forbiddenClaims || []),
      ],
      salesStage: input.salesStage,
    };
  }

  private isPolicyQuestion(text: string): boolean {
    return /استرجاع|استبدال|مرتجع|ترجيع|ضمان|سياس(?:ة|ه)|refund|return|exchange|warranty/i.test(
      text || "",
    );
  }

  private gateCommerceAction(
    llmResult: LlmResult,
    classification: IntentClassification,
    context: LlmContext,
  ): LlmResult {
    const next: LlmResult = {
      ...llmResult,
      response: { ...llmResult.response },
      cartItems: llmResult.cartItems ? [...llmResult.cartItems] : [],
    };
    const mutatingActions = new Set<ActionType>([
      ActionType.UPDATE_CART,
      ActionType.CREATE_ORDER,
      ActionType.CONFIRM_ORDER,
      ActionType.ORDER_CONFIRMED,
    ]);
    const nonMutatingIntents = new Set([
      "greeting",
      "browsing",
      "asking_question",
      "venting",
      "demanding_human",
      "infeasible_request",
      "off_topic",
      "media_request",
      "custom_request",
      // Negative/rejection replies should not mutate cart
      "negative_reply",
      "changing_mind",
    ]);
    // Note: "affirmative", "selecting_all_options", "ordinal_selection" are NOT
    // in nonMutatingIntents — they may legitimately proceed to cart/order.

    const action = next.action || next.response.actionType;
    if (
      classification.intent !== "greeting" &&
      (action === ActionType.GREET || next.response.actionType === ActionType.GREET)
    ) {
      next.action = ActionType.ASK_CLARIFYING_QUESTION;
      next.response.actionType = ActionType.ASK_CLARIFYING_QUESTION;
      next.response.reasoning = [
        next.response.reasoning,
        `commerce_action_gate:normalize_greet:${classification.intent}`,
      ]
        .filter(Boolean)
        .join("|");
    }
    const mustBlock =
      mutatingActions.has(next.action || next.response.actionType) &&
      (nonMutatingIntents.has(classification.intent) ||
        !this.hasExplicitPurchaseCommitment(context.customerMessage) ||
        !this.hasStrongCommerceAnchor(context, next));

    if (mustBlock) {
      next.action = ActionType.ASK_CLARIFYING_QUESTION;
      next.response.actionType = ActionType.ASK_CLARIFYING_QUESTION;
      next.cartItems = [];
      next.deliveryFee = undefined;
      next.discountPercent = undefined;
      next.response.delivery_fee = null;
      next.response.reasoning = [
        next.response.reasoning,
        `commerce_action_gate:block:${classification.intent}`,
      ]
        .filter(Boolean)
        .join("|");
    }

    return next;
  }

  private hasExplicitPurchaseCommitment(text: string): boolean {
    return /(?:أكد|اكد|موافق|اشتري|أشتري|اطلب|أطلب|ضيف|ضف|خد|عايز\s+\d+|عاوز\s+\d+|تمام\s+خد|تمام\s+اطلب)/i.test(
      text || "",
    );
  }

  private hasStrongCommerceAnchor(context: LlmContext, result: LlmResult): boolean {
    return (
      (result.cartItems || []).length > 0 ||
      this.findMentionedCatalogItems(
        context.customerMessage,
        context.catalogItems,
      ).length > 0
    );
  }

  /**
   * Deterministically map unambiguous short-reply resolutions to slot values.
   * These values are merged into filledSlots BEFORE the LLM call so that the
   * memory brief marks them as answered and the LLM does not re-ask.
   */
  private resolveShortReplySlots(
    shortReply: ShortReplyResolution,
    previousDialog: Record<string, any>,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const pendingSlot = (previousDialog.pendingSlot as string | undefined) ?? "";
    const pendingQType =
      (previousDialog.pendingQuestionType as string | undefined) ?? "";

    if (
      shortReply.type === "numeric_value" &&
      shortReply.resolvedValue !== undefined
    ) {
      const num = shortReply.resolvedValue as number;
      if (pendingSlot === "quantity" || pendingQType === "quantity") {
        patch.quantity = num;
      } else if (pendingSlot === "budget" || pendingQType === "budget") {
        patch.budget = num;
      }
      // If pendingSlot is ambiguous, leave resolution to the LLM (contextNote
      // already explains the number to it).
    }

    if (shortReply.type === "location_hint" && shortReply.resolvedValue) {
      patch.delivery_area = shortReply.resolvedValue;
    }

    if (shortReply.type === "date_hint" && shortReply.resolvedValue) {
      patch.deadline = shortReply.resolvedValue;
    }

    return patch;
  }

  /**
   * Build the list of facts injected into replyIntent.answerFacts for the LLM.
   * Produces three levels of signal:
   *   1. The context note explaining what the short reply means.
   *   2. One [ANSWERED_BY_SHORT_REPLY] line per deterministically resolved slot.
   *   3. A [DO_NOT_REPEAT] line when the last asked slot has been answered.
   */
  private buildShortReplyFacts(
    shortReply: ShortReplyResolution,
    previousDialog: Record<string, any>,
    slotPatch: Record<string, unknown>,
  ): string[] {
    if (shortReply.type === "not_short" && !shortReply.contextNote) return [];

    const facts: string[] = [];

    if (shortReply.contextNote) {
      facts.push(`[SHORT_REPLY_CONTEXT] ${shortReply.contextNote}`);
    }

    for (const [slot, value] of Object.entries(slotPatch)) {
      const label = this.slotLabelAr(slot);
      facts.push(
        `[ANSWERED_BY_SHORT_REPLY] ${label} = "${value}". لا تعيد السؤال عن ${label} في هذا الرد.`,
      );
    }

    const lastQuestion = previousDialog.lastQuestion as string | undefined;
    if (
      lastQuestion &&
      shortReply.type !== "not_short" &&
      shortReply.type !== "needs_clarification"
    ) {
      facts.push(
        `[DO_NOT_REPEAT] آخر سؤال كان "${lastQuestion}" وأُجيب عنه بالرسالة الحالية. لا تعيد نفس السؤال.`,
      );
    }

    return facts;
  }

  private slotLabelAr(slot: string): string {
    const labels: Record<string, string> = {
      quantity: "الكمية",
      budget: "الميزانية",
      delivery_area: "منطقة التوصيل",
      deadline: "الموعد",
      product_interest: "المنتج",
      business_type: "نوع النشاط",
      payment_state: "طريقة الدفع",
      customer_intent: "نية العميل",
      closing_stage: "مرحلة الإغلاق",
    };
    return labels[slot] ?? slot;
  }

  private extractFilledSlots(text: string): Record<string, unknown> {
    const filled: Record<string, unknown> = {};
    const raw = String(text || "");
    const size = raw.match(/(\d{2,3})\s*[x×*]\s*(\d{2,3})/i);
    if (size) filled.size = `${size[1]}x${size[2]}`;
    const budget = raw.match(/(?:ميزانية|تحت|حدود|budget)\s*(\d{2,6})/i);
    if (budget) filled.budget = Number(budget[1]);
    if (/النهارده|بكرة|غد|بعد\s+\d+|ساعتين|أسبوع|اسبوع/i.test(raw)) {
      filled.deadline = raw;
    }
    if (/صورة|صور|photo|image/i.test(raw)) filled.media_reference = true;
    if (/حفر|نقش|كتابة\s*اسم|تخصيص|engraving/i.test(raw)) {
      filled.personalization = true;
    }
    return filled;
  }

  private computeAnsweredSlots(
    previous: string[],
    filledSlots: Record<string, unknown>,
  ): string[] {
    return Array.from(new Set([...previous, ...Object.keys(filledSlots)]));
  }

  private appendUnique(values: string[], value?: string | null): string[] {
    if (!value) return values;
    return values.includes(value) ? values : [...values, value];
  }

  private findMentionedCatalogItems(
    text: string,
    catalogItems: CatalogItem[],
  ): CatalogItem[] {
    const normalized = this.normalize(text);
    return catalogItems.filter((item) => {
      const candidates = [item.sku, item.nameAr, item.nameEn, item.name]
        .filter(Boolean)
        .map((value) => this.normalize(String(value)));
      return candidates.some(
        (candidate) => candidate.length >= 3 && normalized.includes(candidate),
      );
    });
  }

  private normalize(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[اأإآ]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/[ة]/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Token budget per sales stage.
   * Rich stages (recommendation, comparison, quote, objection, order_draft) need
   * more tokens to produce a quality reply with options, prices, and structure.
   * Simple stages (discovery, qualification) stay short and WhatsApp-natural.
   */
  private getStageMaxTokens(stage: SalesStage): number {
    const richStages = new Set<SalesStage>([
      "recommendation",
      "comparison",
      "quote",
      "objection_handling",
      "order_draft",
    ]);
    const simpleStages = new Set<SalesStage>([
      "discovery",
      "qualification",
      "followup",
    ]);
    if (richStages.has(stage)) return 680;
    if (simpleStages.has(stage)) return 380;
    return 520;
  }

  /**
   * Stage-specific reply structure fact injected into answerFacts so the LLM
   * knows exactly how to order and format its response.
   * Returns null for stages that don't need explicit structure guidance.
   */
  private getStageReplyStructure(stage: SalesStage): string | null {
    const structures: Partial<Record<SalesStage, string>> = {
      recommendation:
        "هيكل الرد: (1) اعتراف دافئ قصير → (2) قدّم 2-3 خيارات من الكتالوج بأسعارها الحقيقية → (3) رشّح الأنسب مع سبب موجز → (4) سؤال واحد يقرّب الاختيار. لا تخترع أسعاراً.",
      comparison:
        "هيكل الرد: (1) اعتراف قصير → (2) قارن الخيارات بوضوح (السعر والمزايا الجوهرية) → (3) رشّح الأفضل صراحةً مع سبب → (4) سؤال واحد للتأكيد.",
      objection_handling:
        "هيكل الرد: (1) تعاطف حقيقي أولاً ('مفهوم'/'حقك') → (2) اعرض بديلاً أوفر أو فسّر القيمة بوضوح → (3) سؤال واحد يحرّك الحوار للأمام. ممنوع إعادة أسئلة الاكتشاف.",
      quote:
        "هيكل الرد: (1) اذكر السعر أو الإجمالي المقدّر بوضوح من الكتالوج → (2) لو السعر غير موجود قل 'السعر مش متوفر دلوقتي' ولا تخمّن → (3) سؤال واحد للخطوة التالية.",
      order_draft:
        "هيكل الرد: (1) لخّص ما تم الاتفاق عليه (المنتج والكمية إن عُرفا) → (2) اسأل فقط عن أول تفصيل ناقص → (3) لا تدّعي إن الطلب اتعمل قبل التأكيد الصريح.",
      confirmation:
        "هيكل الرد: (1) لخّص الطلب كاملاً (المنتجات والكمية والسعر والتوصيل) → (2) اطلب تأكيداً صريحاً واحداً فقط ('تأكدلك على كده؟').",
    };
    return structures[stage] ?? null;
  }
}
