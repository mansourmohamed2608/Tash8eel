"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const inbox_service_1 = require("../../src/application/services/inbox.service");
const redis_service_1 = require("../../src/infrastructure/redis/redis.service");
const database_module_1 = require("../../src/infrastructure/database/database.module");
const llm_service_1 = require("../../src/application/llm/llm.service");
const outbox_service_1 = require("../../src/application/events/outbox.service");
const merchant_repository_1 = require("../../src/domain/ports/merchant.repository");
const conversation_repository_1 = require("../../src/domain/ports/conversation.repository");
const message_repository_1 = require("../../src/domain/ports/message.repository");
const order_repository_1 = require("../../src/domain/ports/order.repository");
const shipment_repository_1 = require("../../src/domain/ports/shipment.repository");
const customer_repository_1 = require("../../src/domain/ports/customer.repository");
const catalog_repository_1 = require("../../src/domain/ports/catalog.repository");
const known_area_repository_1 = require("../../src/domain/ports/known-area.repository");
const delivery_adapter_interface_1 = require("../../src/application/adapters/delivery-adapter.interface");
const transcription_adapter_1 = require("../../src/application/adapters/transcription.adapter");
const address_depth_service_1 = require("../../src/application/services/address-depth.service");
const payment_service_1 = require("../../src/application/services/payment.service");
const customer_reorder_service_1 = require("../../src/application/services/customer-reorder.service");
const enums_1 = require("../../src/shared/constants/enums");
describe("InboxService - Distributed Locking", () => {
    let inboxService;
    let redisService;
    let acquireLockSpy;
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
    const mockLock = {
        release: jest.fn().mockResolvedValue(undefined),
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                inbox_service_1.InboxService,
                {
                    provide: redis_service_1.RedisService,
                    useValue: {
                        acquireLock: jest.fn(),
                    },
                },
                {
                    provide: database_module_1.DATABASE_POOL,
                    useValue: { query: jest.fn() },
                },
                {
                    provide: llm_service_1.LlmService,
                    useValue: {
                        processMessage: jest.fn().mockResolvedValue({
                            response: {
                                reply_ar: "Test reply",
                                actionType: "ASK_CLARIFYING_QUESTION",
                                extracted_entities: {},
                            },
                            reply: "Test reply",
                            action: enums_1.ActionType.ASK_CLARIFYING_QUESTION,
                            tokensUsed: 100,
                            llmUsed: true,
                            cartItems: [],
                        }),
                    },
                },
                {
                    provide: outbox_service_1.OutboxService,
                    useValue: { publishEvent: jest.fn() },
                },
                {
                    provide: merchant_repository_1.MERCHANT_REPOSITORY,
                    useValue: {
                        findById: jest.fn().mockResolvedValue(mockMerchant),
                    },
                },
                {
                    provide: conversation_repository_1.CONVERSATION_REPOSITORY,
                    useValue: {
                        findByMerchantAndSender: jest
                            .fn()
                            .mockResolvedValue(mockConversation),
                        update: jest.fn(),
                    },
                },
                {
                    provide: message_repository_1.MESSAGE_REPOSITORY,
                    useValue: {
                        create: jest.fn(),
                        findByConversation: jest.fn().mockResolvedValue([]),
                    },
                },
                {
                    provide: order_repository_1.ORDER_REPOSITORY,
                    useValue: { create: jest.fn(), findById: jest.fn() },
                },
                {
                    provide: shipment_repository_1.SHIPMENT_REPOSITORY,
                    useValue: { create: jest.fn() },
                },
                {
                    provide: customer_repository_1.CUSTOMER_REPOSITORY,
                    useValue: {
                        findByMerchantAndSender: jest
                            .fn()
                            .mockResolvedValue({ id: "customer-1" }),
                    },
                },
                {
                    provide: catalog_repository_1.CATALOG_REPOSITORY,
                    useValue: { findByMerchant: jest.fn().mockResolvedValue([]) },
                },
                {
                    provide: known_area_repository_1.KNOWN_AREA_REPOSITORY,
                    useValue: { findByName: jest.fn() },
                },
                {
                    provide: delivery_adapter_interface_1.DELIVERY_ADAPTER,
                    useValue: { bookDelivery: jest.fn() },
                },
                {
                    provide: transcription_adapter_1.TranscriptionAdapterFactory,
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
                    provide: address_depth_service_1.AddressDepthService,
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
                    provide: payment_service_1.PaymentService,
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
                    provide: customer_reorder_service_1.CustomerReorderService,
                    useValue: {
                        isReorderRequest: jest.fn().mockReturnValue(false),
                        checkReorderAvailability: jest.fn(),
                        confirmReorder: jest.fn(),
                        generateReorderConfirmationMessage: jest.fn(),
                    },
                },
            ],
        }).compile();
        inboxService = module.get(inbox_service_1.InboxService);
        redisService = module.get(redis_service_1.RedisService);
        acquireLockSpy = redisService.acquireLock;
    });
    describe("processMessage with locking", () => {
        it("should acquire lock before processing message", async () => {
            acquireLockSpy.mockResolvedValue(mockLock);
            await inboxService.processMessage({
                merchantId: "merchant-1",
                senderId: "user-1",
                text: "عايز تيشيرت",
            });
            expect(acquireLockSpy).toHaveBeenCalledWith("conversation:merchant-1:user-1", 30000);
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
            expect(result.action).toBe(enums_1.ActionType.ASK_CLARIFYING_QUESTION);
        });
        it("should release lock even if processing fails", async () => {
            acquireLockSpy.mockResolvedValue(mockLock);
            // Make merchant repo throw an error
            const merchantRepo = inboxService.merchantRepo;
            merchantRepo.findById.mockRejectedValueOnce(new Error("DB error"));
            await expect(inboxService.processMessage({
                merchantId: "merchant-1",
                senderId: "user-1",
                text: "test",
            })).rejects.toThrow("DB error");
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
            const continuityResponses = results.filter((r) => r.replyText.includes("لحظة واحدة"));
            expect(concurrentAttempts).toBe(1);
            expect(continuityResponses.length).toBe(1);
        });
    });
});
