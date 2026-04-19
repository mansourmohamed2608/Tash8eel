import { ConfigService } from "@nestjs/config";
import { IMerchantRepository } from "../../domain/ports";
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Message } from "../../domain/entities/message.entity";
import { ActionType } from "../../shared/constants/enums";
import { ValidatedLlmResponse } from "./llm-schema";
export interface LlmContext {
    merchant: Merchant;
    conversation: Conversation;
    catalogItems: CatalogItem[];
    recentMessages: Message[];
    customerMessage: string;
}
export interface LlmResult {
    response: ValidatedLlmResponse;
    tokensUsed: number;
    llmUsed: boolean;
    action?: ActionType;
    reply?: string;
    cartItems?: Array<{
        name: string;
        quantity?: number;
        size?: string;
        color?: string;
    }>;
    customerName?: string;
    phone?: string;
    address?: string;
    discountPercent?: number;
    deliveryFee?: number;
    missingSlots?: string[];
}
export type LlmResponse = LlmResult;
export declare function createLlmResult(response: ValidatedLlmResponse, tokensUsed: number, llmUsed: boolean): LlmResult;
export declare class LlmService {
    private configService;
    private merchantRepository;
    private client;
    private model;
    private maxTokens;
    private timeoutMs;
    constructor(configService: ConfigService, merchantRepository: IMerchantRepository);
    processMessage(context: LlmContext): Promise<LlmResult>;
    private callOpenAI;
    private validateResponse;
    private buildSystemPrompt;
    private getCategoryRules;
    private buildCatalogSummary;
    private buildNegotiationRules;
    private buildConversationHistory;
    private buildUserPrompt;
    private checkTokenBudget;
    getRemainingBudget(merchantId: string): Promise<number>;
    private createFallbackResponse;
}
