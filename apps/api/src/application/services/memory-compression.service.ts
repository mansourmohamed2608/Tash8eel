import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../domain/ports/conversation.repository";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from "../../domain/ports/message.repository";
import { Message } from "../../domain/entities/message.entity";
import OpenAI from "openai";

export interface CompressionResult {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  summary: string;
  preservedMessages: number;
  compressedMessages: number;
}

export interface ConversationMemory {
  summary?: string;
  recentMessages: Message[];
  totalMessages: number;
  estimatedTokens: number;
}

@Injectable()
export class MemoryCompressionService {
  private readonly logger = new Logger(MemoryCompressionService.name);
  private readonly openaiClient: OpenAI;

  // Token thresholds
  private readonly MAX_CONTEXT_TOKENS: number;
  private readonly COMPRESSION_THRESHOLD: number;
  private readonly RECENT_MESSAGES_TO_KEEP: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
  ) {
    this.MAX_CONTEXT_TOKENS = this.configService.get<number>(
      "MAX_CONTEXT_TOKENS",
      8000,
    );
    this.COMPRESSION_THRESHOLD = this.configService.get<number>(
      "COMPRESSION_THRESHOLD",
      6000,
    );
    this.RECENT_MESSAGES_TO_KEEP = this.configService.get<number>(
      "RECENT_MESSAGES_TO_KEEP",
      10,
    );

    this.openaiClient = new OpenAI({
      apiKey: this.configService.get<string>("OPENAI_API_KEY"),
    });
  }

  /**
   * Get conversation memory, compressing if necessary
   */
  async getConversationMemory(
    conversationId: string,
  ): Promise<ConversationMemory> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      return {
        recentMessages: [],
        totalMessages: 0,
        estimatedTokens: 0,
      };
    }

    const allMessages =
      await this.messageRepo.findByConversation(conversationId);
    const estimatedTokens = this.estimateTokens(allMessages);

    // If under threshold, return all messages
    if (estimatedTokens <= this.COMPRESSION_THRESHOLD) {
      return {
        summary: (conversation as any).conversationSummary,
        recentMessages: allMessages,
        totalMessages: allMessages.length,
        estimatedTokens,
      };
    }

    // Need compression - get recent messages and existing summary
    const recentMessages = allMessages.slice(-this.RECENT_MESSAGES_TO_KEEP);

    return {
      summary: (conversation as any).conversationSummary,
      recentMessages,
      totalMessages: allMessages.length,
      estimatedTokens: this.estimateTokens(recentMessages),
    };
  }

  /**
   * Check if conversation needs compression
   */
  async needsCompression(conversationId: string): Promise<boolean> {
    const messages = await this.messageRepo.findByConversation(conversationId);
    const estimatedTokens = this.estimateTokens(messages);
    return estimatedTokens > this.COMPRESSION_THRESHOLD;
  }

  /**
   * Compress conversation history into a rolling summary.
   *
   * @internal Called internally by getConversationMemory. Not exposed via
   * any public API route (BL-010: AI sink audit — compressHistory is an
   * internal-only AI flow; no external entrypoint exists).
   */
  async compressConversation(
    conversationId: string,
  ): Promise<CompressionResult> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const allMessages =
      await this.messageRepo.findByConversation(conversationId);
    const originalTokens = this.estimateTokens(allMessages);

    // If under threshold, no compression needed
    if (originalTokens <= this.COMPRESSION_THRESHOLD) {
      return {
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
        summary: (conversation as any).conversationSummary || "",
        preservedMessages: allMessages.length,
        compressedMessages: 0,
      };
    }

    // Keep recent messages, compress the rest
    const recentMessages = allMessages.slice(-this.RECENT_MESSAGES_TO_KEEP);
    const oldMessages = allMessages.slice(0, -this.RECENT_MESSAGES_TO_KEEP);

    if (oldMessages.length === 0) {
      return {
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
        summary: (conversation as any).conversationSummary || "",
        preservedMessages: allMessages.length,
        compressedMessages: 0,
      };
    }

    // Generate summary of old messages
    const existingSummary = (conversation as any).conversationSummary;
    const newSummary = await this.generateSummary(oldMessages, existingSummary);

    // Update conversation with new summary
    await this.conversationRepo.update(conversationId, {
      conversationSummary: newSummary,
    } as any);

    const compressedTokens =
      this.estimateTokens(recentMessages) + this.estimateTextTokens(newSummary);

    this.logger.log({
      msg: "Conversation compressed",
      conversationId,
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens / compressedTokens,
      compressedMessages: oldMessages.length,
    });

    return {
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens / compressedTokens,
      summary: newSummary,
      preservedMessages: recentMessages.length,
      compressedMessages: oldMessages.length,
    };
  }

  /**
   * Generate a summary of messages using LLM
   */
  private async generateSummary(
    messages: Message[],
    existingSummary?: string,
  ): Promise<string> {
    const conversationText = this.formatMessagesForSummary(messages);

    const systemPrompt = `أنت مساعد لتلخيص المحادثات. اكتب ملخص موجز بالعربية يحتوي على:
1. ما طلبه العميل (المنتجات/الخدمات)
2. معلومات العميل المذكورة (اسم، عنوان، تليفون)
3. أي اتفاقات أو مشاكل مهمة
4. حالة الطلب الحالية

اجعل الملخص مختصر ومفيد للمحادثة القادمة.`;

    const userPrompt = existingSummary
      ? `الملخص السابق:
${existingSummary}

المحادثة الجديدة:
${conversationText}

حدث الملخص ليشمل المعلومات الجديدة:`
      : `المحادثة:
${conversationText}

اكتب ملخص موجز:`;

    // If no OpenAI client (mock mode), use fallback
    if (!this.openaiClient) {
      return this.generateFallbackSummary(messages, existingSummary);
    }

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      this.logger.error({
        msg: "Failed to generate summary",
        error: (error as Error).message,
      });

      // Fallback: simple extraction
      return this.generateFallbackSummary(messages, existingSummary);
    }
  }

  /**
   * Fallback summary when LLM is unavailable
   */
  private generateFallbackSummary(
    messages: Message[],
    existingSummary?: string,
  ): string {
    const parts: string[] = [];

    if (existingSummary) {
      parts.push(existingSummary);
    }

    // Extract key info from messages
    const customerMessages = messages
      .filter((m) => m.direction === "inbound")
      .map((m) => m.text)
      .filter(Boolean);

    if (customerMessages.length > 0) {
      parts.push(`آخر رسائل العميل: ${customerMessages.slice(-3).join(" | ")}`);
    }

    parts.push(`عدد الرسائل: ${messages.length}`);

    return parts.join("\n");
  }

  /**
   * Format messages for summary prompt
   */
  private formatMessagesForSummary(messages: Message[]): string {
    return messages
      .map((m) => {
        const role = m.direction === "inbound" ? "العميل" : "المساعد";
        return `${role}: ${m.text || "[رسالة غير نصية]"}`;
      })
      .join("\n");
  }

  /**
   * Estimate token count for messages
   * Rough estimate: 4 characters per token for Arabic/English mixed
   */
  private estimateTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      const textLength = (msg.text || "").length;
      // Use actual tokens if available, otherwise estimate
      return total + (msg.tokensUsed || Math.ceil(textLength / 3));
    }, 0);
  }

  /**
   * Estimate token count for raw text
   */
  private estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  /**
   * Get memory statistics for a conversation
   */
  async getMemoryStats(conversationId: string): Promise<{
    totalMessages: number;
    estimatedTokens: number;
    hasSummary: boolean;
    summaryLength: number;
    needsCompression: boolean;
    compressionThreshold: number;
  }> {
    const conversation = await this.conversationRepo.findById(conversationId);
    const messages = await this.messageRepo.findByConversation(conversationId);
    const estimatedTokens = this.estimateTokens(messages);
    const summary = (conversation as any)?.conversationSummary || "";

    return {
      totalMessages: messages.length,
      estimatedTokens,
      hasSummary: !!summary,
      summaryLength: summary.length,
      needsCompression: estimatedTokens > this.COMPRESSION_THRESHOLD,
      compressionThreshold: this.COMPRESSION_THRESHOLD,
    };
  }
}
