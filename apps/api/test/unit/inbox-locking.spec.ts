import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { InboxService } from "../../src/application/services/inbox.service";
import {
  RedisService,
  Lock,
} from "../../src/infrastructure/redis/redis.service";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";
import { LlmService } from "../../src/application/llm/llm.service";
import { OutboxService } from "../../src/application/events/outbox.service";
import { MERCHANT_REPOSITORY } from "../../src/domain/ports/merchant.repository";
import { CONVERSATION_REPOSITORY } from "../../src/domain/ports/conversation.repository";
import { MESSAGE_REPOSITORY } from "../../src/domain/ports/message.repository";
import { ORDER_REPOSITORY } from "../../src/domain/ports/order.repository";
import { SHIPMENT_REPOSITORY } from "../../src/domain/ports/shipment.repository";
import { CUSTOMER_REPOSITORY } from "../../src/domain/ports/customer.repository";
import { CATALOG_REPOSITORY } from "../../src/domain/ports/catalog.repository";
import { KNOWN_AREA_REPOSITORY } from "../../src/domain/ports/known-area.repository";
import { DELIVERY_ADAPTER } from "../../src/application/adapters/delivery-adapter.interface";
import { TranscriptionAdapterFactory } from "../../src/application/adapters/transcription.adapter";
import { AddressDepthService } from "../../src/application/services/address-depth.service";
import { PaymentService } from "../../src/application/services/payment.service";
import { CustomerReorderService } from "../../src/application/services/customer-reorder.service";
import { UsageGuardService } from "../../src/application/services/usage-guard.service";
import { RagRetrievalService } from "../../src/application/services/rag-retrieval.service";
import { MessageRouterService } from "../../src/application/llm/message-router.service";
import { ActionType } from "../../src/shared/constants/enums";

describe("InboxService - Distributed Locking", () => {
  let inboxService: InboxService;
  let redisService: jest.Mocked<RedisService>;
  let acquireLockSpy: jest.SpyInstance;

  const mockMerchant = {
    id: "merchant-1",
    name: "Test Merchant",
    isActive: true,
    category: "CLOTHES",
    dailyTokenBudget: 100000,
    config: {},
    negotiationRules: { allowNegotiation: true, maxDiscountPercent: 10 },
    deliveryRules: { defaultFee: 30 },
  };

  const mockConversation = {
    id: "conv-1",
    merchantId: "merchant-1",
    senderId: "user-1",
    state: "COLLECTING_ITEMS",
    cart: { items: [] },
    collectedInfo: {},
    missingSlots: [],
  };

  const mockLock: Lock = {
    release: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboxService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === "MERCHANT_PLAN_CACHE_TTL_SECONDS") return "300";
              return defaultValue;
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            acquireLock: jest.fn(),
            get: jest.fn().mockResolvedValue('{"name":"pro","currency":"EGP"}'),
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DATABASE_POOL,
          useValue: { query: jest.fn() },
        },
        {
          provide: LlmService,
          useValue: {
            processMessage: jest.fn().mockResolvedValue({
              response: {
                reply_ar: "Test reply",
                actionType: "ASK_CLARIFYING_QUESTION",
                extracted_entities: {},
              },
              reply: "Test reply",
              action: ActionType.ASK_CLARIFYING_QUESTION,
              tokensUsed: 100,
              llmUsed: true,
              cartItems: [],
            }),
          },
        },
        {
          provide: OutboxService,
          useValue: { publishEvent: jest.fn() },
        },
        {
          provide: MERCHANT_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockMerchant),
          },
        },
        {
          provide: CONVERSATION_REPOSITORY,
          useValue: {
            findByMerchantAndSender: jest
              .fn()
              .mockResolvedValue(mockConversation),
            update: jest.fn(),
          },
        },
        {
          provide: MESSAGE_REPOSITORY,
          useValue: {
            create: jest.fn(),
            findByConversation: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: { create: jest.fn(), findById: jest.fn() },
        },
        {
          provide: SHIPMENT_REPOSITORY,
          useValue: { create: jest.fn() },
        },
        {
          provide: CUSTOMER_REPOSITORY,
          useValue: {
            findByMerchantAndSender: jest
              .fn()
              .mockResolvedValue({ id: "customer-1" }),
          },
        },
        {
          provide: CATALOG_REPOSITORY,
          useValue: { findByMerchant: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: KNOWN_AREA_REPOSITORY,
          useValue: { findByName: jest.fn() },
        },
        {
          provide: DELIVERY_ADAPTER,
          useValue: { bookDelivery: jest.fn() },
        },
        {
          provide: TranscriptionAdapterFactory,
          useValue: {
            getAdapter: jest.fn().mockReturnValue({
              transcribe: jest.fn().mockResolvedValue({
                text: "عايز تيشيرت",
                confidence: 0.95,
                duration: 3,
                language: "ar",
              }),
              isSupported: jest.fn().mockReturnValue(true),
            }),
          },
        },
        {
          provide: AddressDepthService,
          useValue: {
            extractLocationFromText: jest.fn().mockReturnValue(null),
            parseGoogleMapsUrl: jest.fn().mockReturnValue(null),
            analyzeDepth: jest.fn().mockReturnValue({
              level: "city",
              score: 20,
              missingFields: [],
              suggestions: [],
              parsedComponents: {},
            }),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            createPaymentLink: jest.fn(),
            submitPaymentProof: jest.fn(),
            verifyPaymentProof: jest.fn(),
            getPaymentLinkUrl: jest
              .fn()
              .mockReturnValue("https://pay.example.com/abc123"),
          },
        },
        {
          provide: CustomerReorderService,
          useValue: {
            isReorderRequest: jest.fn().mockReturnValue(false),
            checkReorderAvailability: jest.fn(),
            confirmReorder: jest.fn(),
            generateReorderConfirmationMessage: jest.fn(),
          },
        },
        {
          provide: UsageGuardService,
          useValue: {
            consume: jest
              .fn()
              .mockResolvedValue({ allowed: true, used: 1, limit: 10000 }),
            checkLimit: jest
              .fn()
              .mockResolvedValue({ allowed: true, used: 0, limit: 10000 }),
            checkAndTrackConversation: jest.fn().mockResolvedValue({
              isNewConversation: false,
              quotaExceeded: false,
            }),
            notifyMerchantQuotaExceeded: jest.fn().mockResolvedValue(undefined),
            trackOverage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RagRetrievalService,
          useValue: {
            retrieveForQuery: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MessageRouterService,
          useValue: {
            getMediaRedirectReply: jest.fn().mockReturnValue(""),
            getInstantReply: jest.fn().mockResolvedValue("Test instant reply"),
            selectModel: jest.fn().mockReturnValue("gpt-4o-mini"),
            scoreComplexity: jest.fn().mockReturnValue(0.1),
          },
        },
      ],
    }).compile();

    inboxService = module.get<InboxService>(InboxService);
    redisService = module.get(RedisService);
    acquireLockSpy = redisService.acquireLock as jest.SpyInstance;
  });

  describe("processMessage with locking", () => {
    it("should acquire lock before processing message", async () => {
      acquireLockSpy.mockResolvedValue(mockLock);

      await inboxService.processMessage({
        merchantId: "merchant-1",
        senderId: "user-1",
        text: "عايز تيشيرت",
      });

      expect(acquireLockSpy).toHaveBeenCalledWith(
        "conversation:merchant-1:user-1",
        30000,
      );
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("should return continuity response when lock cannot be acquired", async () => {
      acquireLockSpy.mockResolvedValue(null);

      const result = await inboxService.processMessage({
        merchantId: "merchant-1",
        senderId: "user-1",
        text: "عايز تيشيرت",
      });

      expect(result.replyText).toContain("لحظة واحدة");
      expect(result.action).toBe(ActionType.ASK_CLARIFYING_QUESTION);
    });

    it("should release lock even if processing fails", async () => {
      acquireLockSpy.mockResolvedValue(mockLock);

      // Make merchant repo throw an error
      const merchantRepo = (inboxService as any).merchantRepo;
      merchantRepo.findById.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        inboxService.processMessage({
          merchantId: "merchant-1",
          senderId: "user-1",
          text: "test",
        }),
      ).rejects.toThrow("DB error");

      expect(mockLock.release).toHaveBeenCalled();
    });

    it("should prevent race condition with concurrent messages", async () => {
      let lockHeld = false;
      let concurrentAttempts = 0;

      acquireLockSpy.mockImplementation(async () => {
        if (lockHeld) {
          concurrentAttempts++;
          return null; // Lock already held
        }
        lockHeld = true;
        return {
          release: async () => {
            lockHeld = false;
          },
        };
      });

      // Simulate concurrent messages
      const results = await Promise.all([
        inboxService.processMessage({
          merchantId: "merchant-1",
          senderId: "user-1",
          text: "First message",
        }),
        inboxService.processMessage({
          merchantId: "merchant-1",
          senderId: "user-1",
          text: "Second message",
        }),
      ]);

      // One should succeed, one should get continuity response
      const continuityResponses = results.filter((r) =>
        r.replyText.includes("لحظة واحدة"),
      );

      expect(concurrentAttempts).toBe(1);
      expect(continuityResponses.length).toBe(1);
    });
  });
});
