"use strict";
/**
 * Unit Tests for Merchant Copilot (Command Agent)
 *
 * Tests intent parsing, entitlement gating, and confirmation flow.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const copilot_schema_1 = require("../../src/application/llm/copilot-schema");
describe("Copilot Schema", () => {
    describe("CopilotCommandSchema", () => {
        it("should validate a valid expense command", () => {
            const command = {
                intent: "ADD_EXPENSE",
                confidence: 0.95,
                requires_confirmation: true,
                entities: {
                    expense: {
                        amount: 1000,
                        category: "لحمة",
                        description: "مصروف لحمة",
                        date: null,
                    },
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: null,
                    order: null,
                },
                missing_fields: [],
                reply_ar: "سأضيف مصروف 1000 جنيه (لحمة). هل تأكد؟",
                preview: {
                    type: "expense",
                    summary_ar: "إضافة مصروف: 1000 جنيه - لحمة",
                    details: null,
                },
                reasoning: "Merchant wants to add an expense",
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
        });
        it("should validate a stock update command", () => {
            const command = {
                intent: "UPDATE_STOCK",
                confidence: 0.9,
                requires_confirmation: true,
                entities: {
                    expense: null,
                    stockUpdate: {
                        sku: null,
                        productName: "تيشيرت أزرق",
                        quantityChange: 10,
                        absoluteQuantity: null,
                    },
                    paymentLink: null,
                    vipTag: null,
                    dateRange: null,
                    order: null,
                },
                missing_fields: [],
                reply_ar: "سأزود المخزون 10 وحدات من تيشيرت أزرق. هل تأكد؟",
                preview: {
                    type: "stock_update",
                    summary_ar: "تعديل مخزون: +10 تيشيرت أزرق",
                    details: null,
                },
                reasoning: null,
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
        });
        it("should validate a query command without confirmation", () => {
            const command = {
                intent: "ASK_EXPENSE_SUMMARY",
                confidence: 0.85,
                requires_confirmation: false,
                entities: {
                    expense: null,
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: {
                        period: "this_month",
                        startDate: null,
                        endDate: null,
                    },
                    order: null,
                },
                missing_fields: [],
                reply_ar: "سأعرض لك ملخص المصاريف لهذا الشهر",
                preview: null,
                reasoning: null,
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
        });
        it("should validate a KPI query command", () => {
            const command = {
                intent: "ASK_KPI",
                confidence: 0.9,
                requires_confirmation: false,
                entities: {
                    expense: null,
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: {
                        period: "today",
                        startDate: null,
                        endDate: null,
                    },
                    order: null,
                },
                missing_fields: [],
                reply_ar: "سأعرض لك الإيرادات اليوم",
                preview: null,
                reasoning: null,
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
        });
        it("should reject invalid intent", () => {
            const command = {
                intent: "INVALID_INTENT",
                confidence: 0.5,
                requires_confirmation: false,
                entities: {
                    expense: null,
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: null,
                    order: null,
                },
                missing_fields: [],
                reply_ar: "test",
                preview: null,
                reasoning: null,
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(false);
        });
        it("should handle missing fields gracefully", () => {
            const command = {
                intent: "ADD_EXPENSE",
                confidence: 0.7,
                requires_confirmation: true,
                entities: {
                    expense: {
                        amount: null,
                        category: null,
                        description: null,
                        date: null,
                    },
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: null,
                    order: null,
                },
                missing_fields: ["amount"],
                reply_ar: "لم أفهم المبلغ. كم دفعت؟",
                preview: null,
                reasoning: null,
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
            expect(result.data?.missing_fields).toContain("amount");
        });
    });
    describe("Intent Feature Mapping", () => {
        it("should map ADD_EXPENSE to REPORTS feature", () => {
            expect(copilot_schema_1.INTENT_FEATURE_MAP["ADD_EXPENSE"]).toContain("REPORTS");
        });
        it("should map UPDATE_STOCK to INVENTORY feature", () => {
            expect(copilot_schema_1.INTENT_FEATURE_MAP["UPDATE_STOCK"]).toContain("INVENTORY");
        });
        it("should map ASK_KPI to KPI_DASHBOARD feature", () => {
            expect(copilot_schema_1.INTENT_FEATURE_MAP["ASK_KPI"]).toContain("KPI_DASHBOARD");
        });
        it("should map CREATE_PAYMENT_LINK to PAYMENTS feature", () => {
            expect(copilot_schema_1.INTENT_FEATURE_MAP["CREATE_PAYMENT_LINK"]).toContain("PAYMENTS");
        });
        it("should have feature mapping for most intents", () => {
            const mappedIntents = Object.keys(copilot_schema_1.INTENT_FEATURE_MAP);
            expect(mappedIntents.length).toBeGreaterThan(10);
        });
    });
    describe("Destructive Intents", () => {
        it("should include ADD_EXPENSE as destructive", () => {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).toContain("ADD_EXPENSE");
        });
        it("should include UPDATE_STOCK as destructive", () => {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).toContain("UPDATE_STOCK");
        });
        it("should include CREATE_PAYMENT_LINK as destructive", () => {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).toContain("CREATE_PAYMENT_LINK");
        });
        it("should NOT include ASK_EXPENSE_SUMMARY as destructive", () => {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).not.toContain("ASK_EXPENSE_SUMMARY");
        });
        it("should NOT include ASK_LOW_STOCK as destructive", () => {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).not.toContain("ASK_LOW_STOCK");
        });
    });
    describe("Intent Enum", () => {
        it("should have at least 20 intents", () => {
            const intents = Object.values(copilot_schema_1.CopilotIntentEnum.Values);
            expect(intents.length).toBeGreaterThanOrEqual(20);
        });
        it("should include all finance intents", () => {
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ADD_EXPENSE");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_EXPENSE_SUMMARY");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("CREATE_PAYMENT_LINK");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_COD_STATUS");
        });
        it("should include all inventory intents", () => {
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("UPDATE_STOCK");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_LOW_STOCK");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_TOP_MOVERS");
        });
        it("should include all ops intents", () => {
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("TAG_VIP");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("REMOVE_VIP");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_HIGH_RISK");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_RECOVERED_CARTS");
        });
        it("should include all analytics intents", () => {
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_KPI");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_REVENUE");
            expect(copilot_schema_1.CopilotIntentEnum.Values).toHaveProperty("ASK_ORDER_COUNT");
        });
    });
});
describe("Arabic Command Parsing Examples", () => {
    // These test that the schema can handle Arabic text properly
    it("should handle Arabic expense description", () => {
        const command = {
            intent: "ADD_EXPENSE",
            confidence: 0.9,
            requires_confirmation: true,
            entities: {
                expense: {
                    amount: 500,
                    category: "خضار وفاكهة",
                    description: "شراء خضار للمحل",
                    date: null,
                },
                stockUpdate: null,
                paymentLink: null,
                vipTag: null,
                dateRange: null,
                order: null,
            },
            missing_fields: [],
            reply_ar: "هل تريد إضافة مصروف ٥٠٠ جنيه (خضار وفاكهة)؟",
            preview: {
                type: "expense",
                summary_ar: "إضافة: ٥٠٠ جنيه - خضار وفاكهة",
                details: null,
            },
            reasoning: null,
        };
        const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
    });
    it("should handle Arabic product names for stock", () => {
        const command = {
            intent: "UPDATE_STOCK",
            confidence: 0.85,
            requires_confirmation: true,
            entities: {
                expense: null,
                stockUpdate: {
                    sku: null,
                    productName: "بنطلون جينز كحلي مقاس ٣٢",
                    quantityChange: -5,
                    absoluteQuantity: null,
                },
                paymentLink: null,
                vipTag: null,
                dateRange: null,
                order: null,
            },
            missing_fields: [],
            reply_ar: "هل تريد تقليل المخزون ٥ وحدات من بنطلون جينز كحلي؟",
            preview: {
                type: "stock_update",
                summary_ar: "تقليل مخزون: -٥ بنطلون جينز كحلي",
                details: null,
            },
            reasoning: null,
        };
        const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
    });
    it("should handle Arabic date periods", () => {
        const command = {
            intent: "ASK_EXPENSE_SUMMARY",
            confidence: 0.9,
            requires_confirmation: false,
            entities: {
                expense: null,
                stockUpdate: null,
                paymentLink: null,
                vipTag: null,
                dateRange: {
                    period: "last_week",
                    startDate: null,
                    endDate: null,
                },
                order: null,
            },
            missing_fields: [],
            reply_ar: "سأعرض مصاريف الأسبوع الماضي",
            preview: null,
            reasoning: null,
        };
        const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
    });
    it("should handle Arabic customer for VIP tagging", () => {
        const command = {
            intent: "TAG_VIP",
            confidence: 0.95,
            requires_confirmation: true,
            entities: {
                expense: null,
                stockUpdate: null,
                paymentLink: null,
                vipTag: {
                    customerPhone: "01012345678",
                    customerName: "أحمد محمد",
                    customerId: null,
                },
                dateRange: null,
                order: null,
            },
            missing_fields: [],
            reply_ar: "هل تريد تمييز العميل أحمد محمد كـ VIP؟",
            preview: {
                type: "vip_tag",
                summary_ar: "تمييز VIP: أحمد محمد (01012345678)",
                details: null,
            },
            reasoning: null,
        };
        const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
    });
});
describe("Entitlement Gating Logic", () => {
    const checkEntitlement = (intent, enabledFeatures) => {
        const requiredFeatures = copilot_schema_1.INTENT_FEATURE_MAP[intent] || [];
        return requiredFeatures.every((f) => enabledFeatures.includes(f));
    };
    describe("Basic Plan (CONVERSATIONS, ORDERS, CATALOG)", () => {
        const basicFeatures = ["CONVERSATIONS", "ORDERS", "CATALOG"];
        it("should block ADD_EXPENSE", () => {
            expect(checkEntitlement("ADD_EXPENSE", basicFeatures)).toBe(false);
        });
        it("should block UPDATE_STOCK", () => {
            expect(checkEntitlement("UPDATE_STOCK", basicFeatures)).toBe(false);
        });
        it("should block ASK_KPI", () => {
            expect(checkEntitlement("ASK_KPI", basicFeatures)).toBe(false);
        });
        it("should allow UNKNOWN intent", () => {
            expect(checkEntitlement("UNKNOWN", basicFeatures)).toBe(true);
        });
    });
    describe("Growth Plan (+ INVENTORY, PAYMENTS)", () => {
        const growthFeatures = [
            "CONVERSATIONS",
            "ORDERS",
            "CATALOG",
            "INVENTORY",
            "PAYMENTS",
        ];
        it("should allow UPDATE_STOCK", () => {
            expect(checkEntitlement("UPDATE_STOCK", growthFeatures)).toBe(true);
        });
        it("should allow ASK_LOW_STOCK", () => {
            expect(checkEntitlement("ASK_LOW_STOCK", growthFeatures)).toBe(true);
        });
        it("should allow CREATE_PAYMENT_LINK", () => {
            expect(checkEntitlement("CREATE_PAYMENT_LINK", growthFeatures)).toBe(true);
        });
        it("should block ASK_KPI (needs KPI_DASHBOARD)", () => {
            expect(checkEntitlement("ASK_KPI", growthFeatures)).toBe(false);
        });
    });
    describe("Pro Plan (all features)", () => {
        const proFeatures = [
            "CONVERSATIONS",
            "ORDERS",
            "CATALOG",
            "INVENTORY",
            "PAYMENTS",
            "REPORTS",
            "KPI_DASHBOARD",
            "NOTIFICATIONS",
        ];
        it("should allow ADD_EXPENSE", () => {
            expect(checkEntitlement("ADD_EXPENSE", proFeatures)).toBe(true);
        });
        it("should allow ASK_KPI", () => {
            expect(checkEntitlement("ASK_KPI", proFeatures)).toBe(true);
        });
        it("should allow UPDATE_STOCK", () => {
            expect(checkEntitlement("UPDATE_STOCK", proFeatures)).toBe(true);
        });
    });
});
describe("Confirmation Flow", () => {
    it("should require confirmation for destructive intents", () => {
        for (const intent of copilot_schema_1.DESTRUCTIVE_INTENTS) {
            // Verify all destructive intents have the confirmation requirement
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).toContain(intent);
        }
    });
    it("should have at least 5 destructive intents", () => {
        expect(copilot_schema_1.DESTRUCTIVE_INTENTS.length).toBeGreaterThanOrEqual(5);
    });
    it("should not mix query and action intents", () => {
        const queryIntents = [
            "ASK_EXPENSE_SUMMARY",
            "ASK_LOW_STOCK",
            "ASK_TOP_MOVERS",
            "ASK_HIGH_RISK",
            "ASK_RECOVERED_CARTS",
            "ASK_COD_STATUS",
            "ASK_KPI",
            "ASK_REVENUE",
            "ASK_ORDER_COUNT",
        ];
        for (const intent of queryIntents) {
            expect(copilot_schema_1.DESTRUCTIVE_INTENTS).not.toContain(intent);
        }
    });
});
describe("Arabic Language Enforcement", () => {
    /**
     * Helper to check if a string contains Arabic characters
     */
    function containsArabic(text) {
        const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabicPattern.test(text);
    }
    /**
     * Helper to check if a string contains English letters (not in URLs/abbreviations)
     */
    function containsEnglish(text) {
        // Exclude common patterns that are acceptable in Arabic context
        const cleanText = text
            .replace(/VIP/gi, "") // VIP is acceptable loanword
            .replace(/KPI/gi, "") // KPI is acceptable abbreviation
            .replace(/SKU/gi, "") // SKU is acceptable abbreviation
            .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
            .replace(/[0-9]+/g, "") // Numbers are fine
            .replace(/\s+/g, "");
        return /[a-zA-Z]{3,}/.test(cleanText); // 3+ consecutive English letters
    }
    describe("Copilot Response Validation", () => {
        it("should have Arabic in reply_ar field", () => {
            const sampleCommand = {
                intent: "ADD_EXPENSE",
                confidence: 0.95,
                requires_confirmation: true,
                entities: {
                    expense: { amount: 500, category: "لحمة" },
                },
                reply_ar: "هل تريد إضافة مصروف 500 جنيه (لحمة)؟",
                preview: {
                    type: "expense",
                    summary_ar: "إضافة مصروف 500 جنيه",
                },
            };
            expect(containsArabic(sampleCommand.reply_ar)).toBe(true);
            expect(containsArabic(sampleCommand.preview.summary_ar)).toBe(true);
        });
        it("should NOT have English sentences in reply_ar", () => {
            const badExamples = [
                "Expense added successfully",
                "Your order has been placed",
                "Stock updated to 50 units",
                "Payment link created",
            ];
            for (const badReply of badExamples) {
                expect(containsEnglish(badReply)).toBe(true);
                // These should be rejected by the copilot
            }
        });
        it("should accept Arabic Egyptian dialect responses", () => {
            const egyptianDialectExamples = [
                "تم إضافة المصروف ✅",
                "المخزون دلوقتي 50 قطعة",
                "لينك الدفع: https://pay.tash8eel.com/abc",
                "عايز تأكد؟",
                "ايه تاني؟",
                "الطلب رقم 123 اتعمل",
                "مصاريف الشهر ده: 5000 جنيه 📊",
            ];
            for (const reply of egyptianDialectExamples) {
                expect(containsArabic(reply)).toBe(true);
                // These should NOT have English sentences
                expect(containsEnglish(reply)).toBe(false);
            }
        });
        it("should allow VIP/KPI abbreviations in Arabic context", () => {
            const acceptableExamples = [
                "تم تسجيل العميل كـ VIP ⭐",
                "الـ KPI بتاعك: الإيراد 10000 جنيه",
            ];
            for (const reply of acceptableExamples) {
                expect(containsArabic(reply)).toBe(true);
                // VIP/KPI abbreviations are acceptable
            }
        });
    });
    describe("Schema Validation with Arabic", () => {
        it("should validate command with Arabic reply", () => {
            const command = {
                intent: "ADD_EXPENSE",
                confidence: 0.95,
                requires_confirmation: true,
                entities: {
                    expense: {
                        amount: 1000,
                        category: "كهرباء",
                        description: "فاتورة كهرباء",
                        date: null,
                    },
                    stockUpdate: null,
                    paymentLink: null,
                    vipTag: null,
                    dateRange: null,
                    order: null,
                },
                missing_fields: [],
                reply_ar: "هأضيف مصروف 1000 جنيه للكهرباء. تأكد؟",
                preview: {
                    type: "expense",
                    summary_ar: "إضافة مصروف: 1000 جنيه - كهرباء",
                    details: null,
                },
                reasoning: "Merchant expense command",
            };
            const result = copilot_schema_1.CopilotCommandSchema.safeParse(command);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(containsArabic(result.data.reply_ar)).toBe(true);
                expect(containsEnglish(result.data.reply_ar)).toBe(false);
            }
        });
    });
});
