import { execSync } from "child_process";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";

loadDotenv();

type Row = Record<string, unknown>;

interface Args {
  customerPhone?: string;
  merchantPhone?: string;
  phoneNumberId?: string;
  merchantId?: string;
  conversationId?: string;
}

const args = parseArgs(process.argv.slice(2));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslConfig(),
  });

  try {
    const gitSha = getGitSha();
    const phoneMapping = await findPhoneMapping(pool, args);
    const merchantId =
      args.merchantId ||
      stringValue(phoneMapping?.merchant_id) ||
      (args.conversationId
        ? await findMerchantIdByConversation(pool, args.conversationId)
        : undefined);

    const conversation = await findConversation(pool, {
      merchantId,
      conversationId: args.conversationId,
      customerPhone: args.customerPhone,
    });
    const resolvedMerchantId =
      merchantId || stringValue(conversation?.merchant_id) || undefined;

    const [merchant, messages, catalogItems, kbChunks, businessRules] =
      resolvedMerchantId
        ? await Promise.all([
            findMerchant(pool, resolvedMerchantId),
            conversation
              ? findMessages(pool, stringValue(conversation.id) || "")
              : Promise.resolve([]),
            findCatalogItems(pool, resolvedMerchantId),
            findKbChunks(pool, resolvedMerchantId),
            findBusinessRules(pool, resolvedMerchantId),
          ])
        : await Promise.all([
            Promise.resolve(null),
            Promise.resolve([]),
            Promise.resolve([]),
            Promise.resolve([]),
            Promise.resolve([]),
          ]);

    const output = {
      gitSha,
      environment: {
        AI_REPLY_ENGINE: valueOrEmpty(process.env.AI_REPLY_ENGINE),
        AI_V2_LOCAL_TEST_MODE: valueOrEmpty(process.env.AI_V2_LOCAL_TEST_MODE),
        NODE_ENV: valueOrEmpty(process.env.NODE_ENV),
        OPENAI_MODEL: valueOrEmpty(process.env.OPENAI_MODEL),
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
          ? `present length=${process.env.OPENAI_API_KEY.length}`
          : "missing",
      },
      target: {
        merchantId: resolvedMerchantId || null,
        conversationId: stringValue(conversation?.id) || null,
        customerPhone: maskPhone(args.customerPhone || conversation?.sender_id),
        merchantPhone: maskPhone(
          args.merchantPhone || phoneMapping?.phone_number,
        ),
        phoneNumberId: maskIdentifier(
          args.phoneNumberId ||
            stringValue(phoneMapping?.phone_number_id) ||
            metadataPhoneNumberId(phoneMapping?.metadata),
        ),
      },
      routing: summarizeRouting(phoneMapping, merchant, conversation),
      merchantFacts: summarizeMerchantFacts(merchant),
      catalog: summarizeCatalog(catalogItems),
      kb: summarizeKb(kbChunks),
      businessRules: summarizeRules(businessRules),
      conversation: summarizeConversation(conversation, messages),
      dataQuality: summarizeDataQuality({
        merchant,
        phoneMapping,
        catalogItems,
        kbChunks,
        conversation,
        messages,
      }),
      resetGuidance: buildResetGuidance({
        conversation,
        catalogItems,
        kbChunks,
      }),
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await pool.end();
  }
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    customerPhone: process.env.AI_V2_INSPECT_CUSTOMER_PHONE,
    merchantPhone: process.env.AI_V2_INSPECT_MERCHANT_PHONE,
    phoneNumberId: process.env.AI_V2_INSPECT_PHONE_NUMBER_ID,
    merchantId: process.env.AI_V2_INSPECT_MERCHANT_ID,
    conversationId: process.env.AI_V2_INSPECT_CONVERSATION_ID,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (!next) continue;
    if (current === "--customer-phone") parsed.customerPhone = next;
    if (current === "--merchant-phone") parsed.merchantPhone = next;
    if (current === "--phone-number-id") parsed.phoneNumberId = next;
    if (current === "--merchant-id") parsed.merchantId = next;
    if (current === "--conversation-id") parsed.conversationId = next;
    if (current.startsWith("--")) i += 1;
  }
  return parsed;
}

function sslConfig(): boolean | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { rejectUnauthorized: false };
  }
  return process.env.DATABASE_SSL === "true";
}

async function findPhoneMapping(pool: Pool, input: Args): Promise<Row | null> {
  const phone = input.merchantPhone;
  const digits = digitsOnly(phone);
  const variants = phoneVariants(phone);
  const whatsAppVariants = variants.map((v) =>
    v.startsWith("whatsapp:") ? v : `whatsapp:${v}`,
  );

  const result = await pool.query(
    `SELECT *,
            metadata->>'phone_number_id' AS phone_number_id
       FROM merchant_phone_numbers
      WHERE is_active = true
        AND (
          ($1::text IS NOT NULL AND metadata->>'phone_number_id' = $1)
          OR ($2::text[] IS NOT NULL AND phone_number = ANY($2))
          OR ($3::text[] IS NOT NULL AND whatsapp_number = ANY($3))
          OR ($4::text IS NOT NULL AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = $4)
          OR ($4::text IS NOT NULL AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $4)
        )
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1`,
    [
      input.phoneNumberId || null,
      variants.length > 0 ? variants : null,
      whatsAppVariants.length > 0 ? whatsAppVariants : null,
      digits || null,
    ],
  );
  return result.rows[0] || null;
}

async function findMerchantIdByConversation(
  pool: Pool,
  conversationId: string,
): Promise<string | undefined> {
  const result = await pool.query(
    `SELECT merchant_id FROM conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  );
  return stringValue(result.rows[0]?.merchant_id);
}

async function findConversation(
  pool: Pool,
  input: {
    merchantId?: string;
    conversationId?: string;
    customerPhone?: string;
  },
): Promise<Row | null> {
  if (input.conversationId) {
    const result = await pool.query(
      `SELECT * FROM conversations WHERE id = $1 LIMIT 1`,
      [input.conversationId],
    );
    return result.rows[0] || null;
  }

  const digits = digitsOnly(input.customerPhone);
  if (input.merchantId && digits) {
    const result = await pool.query(
      `SELECT *
         FROM conversations
        WHERE merchant_id = $1
          AND COALESCE(channel, 'whatsapp') = 'whatsapp'
          AND regexp_replace(COALESCE(sender_id, ''), '\\D', '', 'g') = $2
          AND state NOT IN ('CLOSED')
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
        LIMIT 1`,
      [input.merchantId, digits],
    );
    if (result.rows[0]) return result.rows[0];
  }

  if (input.merchantId) {
    const result = await pool.query(
      `SELECT *
         FROM conversations
        WHERE merchant_id = $1
          AND COALESCE(channel, 'whatsapp') = 'whatsapp'
          AND state NOT IN ('CLOSED')
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
        LIMIT 1`,
      [input.merchantId],
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT *
       FROM conversations
      WHERE COALESCE(channel, 'whatsapp') = 'whatsapp'
        AND state NOT IN ('CLOSED')
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
      LIMIT 1`,
  );
  return result.rows[0] || null;
}

async function findMerchant(
  pool: Pool,
  merchantId: string,
): Promise<Row | null> {
  const result = await pool.query(`SELECT * FROM merchants WHERE id = $1`, [
    merchantId,
  ]);
  return result.rows[0] || null;
}

async function findMessages(
  pool: Pool,
  conversationId: string,
): Promise<Row[]> {
  const result = await pool.query(
    `SELECT id, direction, sender_id, text, metadata, llm_used, tokens_used, created_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId],
  );
  return result.rows;
}

async function findCatalogItems(
  pool: Pool,
  merchantId: string,
): Promise<Row[]> {
  const cols = await tableColumns(pool, "catalog_items");
  const selected = [
    "id",
    "merchant_id",
    "sku",
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "category",
    "base_price",
    "min_price",
    "tags",
    "is_available",
    "is_active",
    "customer_visible_sku",
    "source_label",
    "created_at",
    "updated_at",
  ].filter((c) => cols.has(c));

  const result = await pool.query(
    `SELECT ${selected.join(", ")}
       FROM catalog_items
      WHERE merchant_id = $1
      ORDER BY COALESCE(is_active, is_available, true) DESC, name_ar ASC`,
    [merchantId],
  );
  return result.rows;
}

async function findKbChunks(pool: Pool, merchantId: string): Promise<Row[]> {
  const result = await pool.query(
    `SELECT id, source_type, source_id, business_type, module, category,
            locale, visibility, confidence_level, requires_manual_review, tags,
            title, content, metadata, is_active, last_updated, source_reference
       FROM merchant_kb_chunks
      WHERE merchant_id = $1
        AND is_active = true
      ORDER BY visibility ASC, source_type ASC, last_updated DESC
      LIMIT 50`,
    [merchantId],
  );
  return result.rows;
}

async function findBusinessRules(
  pool: Pool,
  merchantId: string,
): Promise<Row[]> {
  const result = await pool.query(
    `SELECT rule_type, rule_name, rule_description, condition, action,
            confidence_required, human_review_required, status
       FROM merchant_business_rules
      WHERE merchant_id = $1
        AND status = 'active'
      ORDER BY rule_type ASC, sort_order ASC
      LIMIT 50`,
    [merchantId],
  );
  return result.rows;
}

async function tableColumns(
  pool: Pool,
  tableName: string,
): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(result.rows.map((r) => String(r.column_name)));
}

function summarizeRouting(
  phoneMapping: Row | null,
  merchant: Row | null,
  conversation: Row | null,
) {
  return {
    merchantPhoneSource: phoneMapping
      ? "merchant_phone_numbers"
      : merchant?.whatsapp_number
        ? "merchant_profile"
        : "not_found",
    phoneMappingFound: Boolean(phoneMapping),
    phoneMappingMerchantId: stringValue(phoneMapping?.merchant_id) || null,
    displayName: safeText(phoneMapping?.display_name, 80),
    provider: stringValue(phoneMapping?.provider) || null,
    isSandbox: booleanValue(phoneMapping?.is_sandbox),
    phoneNumber: maskPhone(phoneMapping?.phone_number),
    whatsappNumber: maskPhone(phoneMapping?.whatsapp_number),
    conversationSender: maskPhone(conversation?.sender_id),
  };
}

function summarizeMerchantFacts(merchant: Row | null) {
  if (!merchant) return null;
  return {
    id: stringValue(merchant.id),
    name: safeText(merchant.name, 120),
    category: stringValue(merchant.category),
    city: safeText(merchant.city, 80),
    currency: stringValue(merchant.currency),
    language: stringValue(merchant.language),
    whatsappNumber: maskPhone(merchant.whatsapp_number),
    hasKnowledgeBase: objectSize(merchant.knowledge_base) > 0,
    knowledgeBaseTopLevelKeys: Object.keys(
      asObject(merchant.knowledge_base),
    ).sort(),
    workingHours: summarizeJson(merchant.working_hours),
  };
}

function summarizeCatalog(items: Row[]) {
  const active = items.filter((i) => i.is_active !== false);
  const duplicates = duplicateProducts(items);
  return {
    productCount: items.length,
    activeProductCount: active.length,
    customerSafeProducts: active.slice(0, 25).map((item) => ({
      name: safeCatalogText(item.name_ar || item.name_en, item),
      description: safeCatalogText(
        item.description_ar || item.description_en,
        item,
      ),
      price: numberValue(item.base_price),
      minPrice: numberValue(item.min_price),
      available: item.is_available !== false,
      customerVisibleSku: item.customer_visible_sku === true,
      skuShown:
        item.customer_visible_sku === true ? safeText(item.sku, 80) : null,
      category: safeText(item.category, 80),
      sourceLabel: safeText(item.source_label, 80),
      tags: textArray(item.tags)
        .slice(0, 8)
        .map((tag) => safeText(tag, 60)),
    })),
    duplicateOrDirtyProducts: duplicates,
    sourceLabels: unique(
      items.map((i) => stringValue(i.source_label)).filter(Boolean) as string[],
    ).slice(0, 25),
  };
}

function summarizeKb(chunks: Row[]) {
  const publicChunks = chunks.filter((c) => c.visibility === "public");
  return {
    totalActiveChunks: chunks.length,
    publicChunkCount: publicChunks.length,
    nonPublicChunkCount: chunks.length - publicChunks.length,
    publicPreviews: publicChunks.slice(0, 20).map((chunk) => ({
      sourceType: stringValue(chunk.source_type),
      title: safeText(chunk.title, 120),
      preview: safeText(chunk.content, 180),
      locale: stringValue(chunk.locale),
      confidenceLevel: stringValue(chunk.confidence_level),
      category: safeText(chunk.category, 80),
      tags: textArray(chunk.tags)
        .slice(0, 8)
        .map((tag) => safeText(tag, 60)),
    })),
    ragSourceLabels: unique(
      publicChunks
        .map((chunk) => stringValue(chunk.source_type))
        .filter(Boolean) as string[],
    ).sort(),
  };
}

function summarizeRules(rules: Row[]) {
  return {
    activeRuleCount: rules.length,
    ruleTypes: unique(
      rules
        .map((rule) => stringValue(rule.rule_type))
        .filter(Boolean) as string[],
    ).sort(),
    previews: rules.slice(0, 20).map((rule) => ({
      type: stringValue(rule.rule_type),
      name: safeText(rule.rule_name, 100),
      description: safeText(rule.rule_description, 160),
      humanReviewRequired: booleanValue(rule.human_review_required),
    })),
  };
}

function summarizeConversation(conversation: Row | null, messages: Row[]) {
  const context = asObject(conversation?.context);
  const aiV2 = asObject(context.aiV2);
  return {
    id: stringValue(conversation?.id) || null,
    state: stringValue(conversation?.state) || null,
    channel: stringValue(conversation?.channel) || "whatsapp",
    hasAiV2State: Object.keys(aiV2).length > 0,
    aiV2Summary: summarizeAiV2(aiV2),
    messageCount: messages.length,
    last20MessagePreviews: messages.slice(-20).map((message) => ({
      direction: stringValue(message.direction),
      createdAt: isoString(message.created_at),
      text: safeText(maskPhonesInText(stringValue(message.text)), 160),
      llmUsed: booleanValue(message.llm_used),
      tokensUsed: numberValue(message.tokens_used),
    })),
  };
}

function summarizeDataQuality(input: {
  merchant: Row | null;
  phoneMapping: Row | null;
  catalogItems: Row[];
  kbChunks: Row[];
  conversation: Row | null;
  messages: Row[];
}) {
  const searchable = [
    input.merchant?.id,
    input.merchant?.name,
    input.phoneMapping?.display_name,
    input.phoneMapping?.provider,
    ...input.catalogItems.flatMap((i) => [
      i.name_ar,
      i.name_en,
      i.description_ar,
      i.description_en,
      i.sku,
      i.source_label,
      ...textArray(i.tags),
    ]),
    ...input.kbChunks.flatMap((k) => [
      k.title,
      k.content,
      k.source_type,
      k.source_reference,
      ...textArray(k.tags),
    ]),
  ]
    .map((v) => String(v || ""))
    .join("\n");

  const aiV2 = asObject(asObject(input.conversation?.context).aiV2);
  return {
    fixtureDemoLocalTestDataPresent: /fixture|local|test|demo|seed/i.test(
      searchable,
    ),
    unsafeIdsSkusSourceLabelsPresent:
      hasUnsafeCustomerText(input.catalogItems) || hasUnsafeLabels(searchable),
    duplicateProductGroups: duplicateProducts(input.catalogItems).length,
    staleAiV2StatePresent: Object.keys(aiV2).length > 0,
    oldConversationMessageCount: input.messages.length,
    phoneMappingMerchantMismatch:
      Boolean(
        input.phoneMapping?.merchant_id && input.conversation?.merchant_id,
      ) && input.phoneMapping?.merchant_id !== input.conversation?.merchant_id,
    inactiveCatalogCount: input.catalogItems.filter(
      (i) => i.is_active === false,
    ).length,
    privateKbChunkCount: input.kbChunks.filter((k) => k.visibility !== "public")
      .length,
  };
}

function buildResetGuidance(input: {
  conversation: Row | null;
  catalogItems: Row[];
  kbChunks: Row[];
}) {
  const hasAiV2 = Object.keys(
    asObject(asObject(input.conversation?.context).aiV2),
  ).length;
  const dirtyCatalog =
    duplicateProducts(input.catalogItems).length > 0 ||
    hasUnsafeCustomerText(input.catalogItems);
  const dirtyKb = input.kbChunks.some((k) =>
    /fixture|local|test|demo|seed/i.test(
      [k.title, k.content, k.source_reference, ...textArray(k.tags)].join("\n"),
    ),
  );
  return {
    clearOnlyConversationAiV2First: hasAiV2 > 0,
    resetPostgresOrRagRecommended: dirtyCatalog || dirtyKb,
    reason: [
      hasAiV2 > 0 ? "conversation.context.aiV2 exists" : null,
      dirtyCatalog ? "catalog has duplicate/unsafe/dirty-looking values" : null,
      dirtyKb ? "KB/RAG has fixture/demo/test-looking values" : null,
    ].filter(Boolean),
  };
}

function summarizeAiV2(aiV2: Record<string, unknown>) {
  if (Object.keys(aiV2).length === 0) return null;
  const orderDraft = asObject(aiV2.orderDraft);
  const complaintState = asObject(aiV2.complaintState);
  const knownFacts = asObject(aiV2.knownFacts);
  return {
    keys: Object.keys(aiV2).sort(),
    stage: stringValue(aiV2.stage || aiV2.salesStage || aiV2.currentStage),
    activeQuestionKind: stringValue(
      asObject(aiV2.activeQuestion).kind || asObject(aiV2.activeQuestion).type,
    ),
    selectedItemsCount: Array.isArray(aiV2.selectedItems)
      ? aiV2.selectedItems.length
      : undefined,
    orderDraft: Object.keys(orderDraft).length
      ? {
          status: stringValue(orderDraft.status),
          quantity: numberValue(orderDraft.quantity),
          missingFieldsCount: Array.isArray(orderDraft.missingFields)
            ? orderDraft.missingFields.length
            : undefined,
        }
      : null,
    complaintState: Object.keys(complaintState).length
      ? {
          status: stringValue(complaintState.status),
          reason: safeText(complaintState.reason, 120),
          preserved: true,
        }
      : null,
    knownFactKeys: Object.keys(knownFacts).sort(),
  };
}

function duplicateProducts(items: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const item of items) {
    const name = normalizeText(item.name_ar || item.name_en);
    const price = String(item.base_price || "");
    const key = `${name}|${price}`;
    if (!name) continue;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      name: safeText(group[0].name_ar || group[0].name_en, 120),
      price: numberValue(group[0].base_price),
      count: group.length,
    }));
}

function hasUnsafeCustomerText(items: Row[]): boolean {
  return items.some((item) => {
    const allowSku = item.customer_visible_sku === true;
    const text = [
      item.name_ar,
      item.name_en,
      item.description_ar,
      item.description_en,
      allowSku ? "" : item.sku,
    ].join("\n");
    return (
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(text) ||
      (!allowSku &&
        /\b(?:sku|cat|kb|fixture|seed|local|test)[_: -]?\w+/i.test(text))
    );
  });
}

function hasUnsafeLabels(text: string): boolean {
  return /\b(?:fixture|local|test|seed|internal|debug)\b/i.test(text);
}

function safeCatalogText(value: unknown, item: Row): string | null {
  const allowSku = item.customer_visible_sku === true;
  const text = stringValue(value);
  if (!text) return null;
  if (!allowSku && /\b(?:sku|cat|kb)[:_-][A-Za-z0-9_-]+/i.test(text)) {
    return "[masked unsafe catalog text]";
  }
  return safeText(text, 180);
}

function safeText(value: unknown, limit: number): string | null {
  const text = stringValue(value);
  if (!text) return null;
  return maskPhonesInText(text.replace(/\s+/g, " ").trim()).slice(0, limit);
}

function maskPhone(value: unknown): string | null {
  const digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function maskIdentifier(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  if (text.length <= 6) return "***";
  return `${text.slice(0, 2)}***${text.slice(-4)}`;
}

function maskPhonesInText(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, (match) => {
    const masked = maskPhone(match);
    return masked || "[masked-phone]";
  });
}

function phoneVariants(value: unknown): string[] {
  const raw = stringValue(value);
  const digits = digitsOnly(value);
  const values = new Set<string>();
  if (raw) values.add(raw);
  if (digits) {
    values.add(digits);
    values.add(`+${digits}`);
  }
  return [...values];
}

function digitsOnly(value: unknown): string {
  return stringValue(value)?.replace(/\D/g, "") || "";
}

function normalizeText(value: unknown): string {
  return stringValue(value)?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  return String(value).toLowerCase() === "true";
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
}

function objectSize(value: unknown): number {
  return Object.keys(asObject(value)).length;
}

function summarizeJson(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === "string") return safeText(value, 160);
  if (typeof value === "object") return value;
  return String(value);
}

function metadataPhoneNumberId(value: unknown): string | undefined {
  return stringValue(asObject(value).phone_number_id);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isoString(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function valueOrEmpty(value: unknown): string {
  return stringValue(value) || "";
}

function getGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  if (process.env.IMAGE_TAG) return process.env.IMAGE_TAG;
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unavailable";
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: message }, null, 2));
  process.exitCode = 1;
});
