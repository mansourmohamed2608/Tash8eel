"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const finance_ai_service_1 = require("../../src/application/llm/finance-ai.service");
// Mock merchant repository
const mockMerchantRepository = {
    findById: jest
        .fn()
        .mockResolvedValue({ id: "merchant-1", dailyTokenBudget: 100000 }),
    getTokenUsage: jest.fn().mockResolvedValue({ tokensUsed: 0 }),
    incrementTokenUsage: jest.fn().mockResolvedValue(undefined),
};
// Mock config service
const mockConfigService = {
    get: jest.fn((key, defaultValue) => {
        if (key === "OPENAI_API_KEY")
            return undefined; // No OpenAI for unit tests
        if (key === "OPENAI_MODEL")
            return "gpt-4o-mini";
        return defaultValue;
    }),
};
describe("FinanceAiService", () => {
    let service;
    beforeEach(() => {
        service = new finance_ai_service_1.FinanceAiService(mockConfigService, mockMerchantRepository);
    });
    describe("calculateProfitMetrics", () => {
        it("should calculate correct gross and net profit", () => {
            const request = {
                revenue: 10000,
                cogs: 6000,
                expenses: 1500,
                deliveryFees: 500,
                discounts: 200,
            };
            const result = service.calculateProfitMetrics(request);
            expect(result.grossProfit).toBe(4000); // 10000 - 6000
            expect(result.grossMargin).toBe(40); // (4000/10000) * 100
            expect(result.netProfit).toBe(2300); // 10000 - 6000 - 1500 - 200
            expect(result.netMargin).toBe(23); // (2300/10000) * 100
        });
        it("should handle zero revenue", () => {
            const request = {
                revenue: 0,
                cogs: 0,
                expenses: 100,
                deliveryFees: 0,
                discounts: 0,
            };
            const result = service.calculateProfitMetrics(request);
            expect(result.grossMargin).toBe(0);
            expect(result.netMargin).toBe(0);
        });
        it("should handle negative net profit", () => {
            const request = {
                revenue: 1000,
                cogs: 800,
                expenses: 500,
                deliveryFees: 50,
                discounts: 0,
            };
            const result = service.calculateProfitMetrics(request);
            expect(result.netProfit).toBe(-300); // 1000 - 800 - 500
            expect(result.netMargin).toBe(-30);
        });
    });
    describe("calculateCodReconciliation", () => {
        it("should calculate correct COD reconciliation", () => {
            const collections = [
                {
                    orderId: "order-1",
                    amount: 500,
                    status: "collected",
                    collectedAt: new Date(),
                },
                {
                    orderId: "order-2",
                    amount: 300,
                    status: "collected",
                    collectedAt: new Date(),
                },
                { orderId: "order-3", amount: 400, status: "pending" },
            ];
            const result = service.calculateCodReconciliation(collections);
            expect(result.totalExpected).toBe(1200);
            expect(result.totalCollected).toBe(800);
            expect(result.totalPending).toBe(400);
            expect(result.collectionRate).toBeCloseTo(66.67, 1);
        });
        it("should detect overdue collections", () => {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            const collections = [
                {
                    orderId: "order-1",
                    amount: 500,
                    status: "pending",
                    collectedAt: threeDaysAgo,
                },
                {
                    orderId: "order-2",
                    amount: 300,
                    status: "pending",
                    collectedAt: threeDaysAgo,
                },
            ];
            const result = service.calculateCodReconciliation(collections);
            expect(result.overdueCount).toBe(2);
        });
        it("should return 100% collection rate when all collected", () => {
            const collections = [
                {
                    orderId: "order-1",
                    amount: 500,
                    status: "collected",
                    collectedAt: new Date(),
                },
            ];
            const result = service.calculateCodReconciliation(collections);
            expect(result.collectionRate).toBe(100);
            expect(result.totalPending).toBe(0);
        });
    });
    describe("detectMarginAlerts", () => {
        it("should detect negative margin products", () => {
            const products = [
                {
                    id: "prod-1",
                    name: "Product A",
                    price: 100,
                    cogs: 120,
                    salesCount: 10,
                },
            ];
            const alerts = service.detectMarginAlerts(products);
            expect(alerts).toHaveLength(1);
            expect(alerts[0].alertType).toBe("negative_margin");
            expect(alerts[0].severity).toBe("critical");
            expect(alerts[0].affectedProducts).toContain("Product A");
        });
        it("should detect low margin products with custom thresholds", () => {
            const products = [
                {
                    id: "prod-1",
                    name: "Product A",
                    price: 100,
                    cogs: 92,
                    salesCount: 10,
                }, // 8% margin
                {
                    id: "prod-2",
                    name: "Product B",
                    price: 100,
                    cogs: 85,
                    salesCount: 5,
                }, // 15% margin
            ];
            const alerts = service.detectMarginAlerts(products, {
                lowMargin: 20,
                criticalMargin: 10,
            });
            expect(alerts).toHaveLength(2);
            expect(alerts[0].severity).toBe("critical"); // 8% margin < 10% criticalMargin
            expect(alerts[1].severity).toBe("warning"); // 15% margin < 20% lowMargin but > 10%
        });
        it("should return no alerts for healthy margins", () => {
            const products = [
                {
                    id: "prod-1",
                    name: "Product A",
                    price: 100,
                    cogs: 50,
                    salesCount: 10,
                }, // 50% margin
            ];
            const alerts = service.detectMarginAlerts(products);
            expect(alerts).toHaveLength(0);
        });
    });
    describe("detectSpendingAlert", () => {
        it("should detect when expenses exceed revenue", () => {
            const metrics = {
                totalRevenue: 5000,
                totalCogs: 3000,
                grossProfit: 2000,
                grossMargin: 40,
                totalExpenses: 6000,
                netProfit: -4000,
                netMargin: -80,
                codCollected: 3000,
                codPending: 2000,
                averageOrderValue: 250,
                orderCount: 20,
            };
            const result = service.detectSpendingAlert(metrics);
            expect(result.hasAlert).toBe(true);
            expect(result.alert?.severity).toBe("critical");
            expect(result.alert?.alertType).toBe("cost_spike");
        });
        it("should detect high expense ratio (>80%)", () => {
            const metrics = {
                totalRevenue: 10000,
                totalCogs: 5000,
                grossProfit: 5000,
                grossMargin: 50,
                totalExpenses: 8500, // 85% of revenue
                netProfit: -3500,
                netMargin: -35,
                codCollected: 8000,
                codPending: 2000,
                averageOrderValue: 500,
                orderCount: 20,
            };
            const result = service.detectSpendingAlert(metrics);
            expect(result.hasAlert).toBe(true);
            expect(result.alert?.severity).toBe("warning");
        });
        it("should return no alert for healthy finances", () => {
            const metrics = {
                totalRevenue: 10000,
                totalCogs: 5000,
                grossProfit: 5000,
                grossMargin: 50,
                totalExpenses: 3000, // 30% of revenue
                netProfit: 2000,
                netMargin: 20,
                codCollected: 8000,
                codPending: 2000,
                averageOrderValue: 500,
                orderCount: 20,
            };
            const result = service.detectSpendingAlert(metrics);
            expect(result.hasAlert).toBe(false);
        });
    });
});
