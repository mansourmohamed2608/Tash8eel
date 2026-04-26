/**
 * AI Reply Engine v2 — tool contracts (implementations wired in later waves).
 */

export interface ToolContextV2 {
  merchantId: string;
  conversationId: string;
}

export interface SearchCatalogParams {
  query: string;
  limit?: number;
}

export interface ICatalogToolsV2 {
  searchCatalog(ctx: ToolContextV2, p: SearchCatalogParams): Promise<unknown[]>;
  getCatalogItem(
    ctx: ToolContextV2,
    catalogItemId: string,
  ): Promise<unknown | null>;
  checkStock(
    ctx: ToolContextV2,
    catalogItemId: string,
  ): Promise<unknown | null>;
}

export interface IOrderToolsV2 {
  createDraftOrder(ctx: ToolContextV2, input: unknown): Promise<unknown>;
  updateDraftOrder(ctx: ToolContextV2, input: unknown): Promise<unknown>;
}

export interface IPaymentToolsV2 {
  getMerchantPaymentSettings(ctx: ToolContextV2): Promise<unknown>;
  sendPaymentInstructions(ctx: ToolContextV2, input: unknown): Promise<unknown>;
}

export interface IKbToolsV2 {
  searchPublicKB(ctx: ToolContextV2, query: string): Promise<unknown[]>;
  getBusinessRules(ctx: ToolContextV2): Promise<unknown>;
}

export interface IMemoryToolsV2 {
  retrieveConversationMemory(ctx: ToolContextV2): Promise<string | null>;
  saveConversationMemory(ctx: ToolContextV2, summary: string): Promise<void>;
}

export interface AiV2ToolRegistry {
  catalog?: ICatalogToolsV2;
  order?: IOrderToolsV2;
  payment?: IPaymentToolsV2;
  kb?: IKbToolsV2;
  memory?: IMemoryToolsV2;
}
