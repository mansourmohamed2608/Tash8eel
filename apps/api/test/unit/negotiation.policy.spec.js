"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const negotiation_policy_1 = require("../../src/application/policies/negotiation.policy");
const enums_1 = require("../../src/shared/constants/enums");
/**
 * Helper to create a NegotiationRequest from discount percentage
 */
function createRequest(requestedDiscount) {
    return { requestedDiscount };
}
/**
 * Helper to create default rules for testing
 */
function createRules(overrides = {}) {
    return {
        allowNegotiation: true,
        maxDiscountPercent: 10,
        minMarginPercent: 20,
        ...overrides,
    };
}
/**
 * Helper to create a cart for testing
 */
function createCart(itemCount, quantityEach = 1) {
    const total = itemCount * quantityEach * 100;
    return {
        items: Array.from({ length: itemCount }, (_, i) => ({
            productId: `product-${i}`,
            name: `Item ${i}`,
            quantity: quantityEach,
            unitPrice: 100,
            lineTotal: quantityEach * 100,
        })),
        subtotal: total,
        discount: 0,
        deliveryFee: 0,
        total: total,
    };
}
describe("NegotiationPolicyFactory", () => {
    describe("ClothesNegotiationPolicy", () => {
        const policy = negotiation_policy_1.NegotiationPolicyFactory.create(enums_1.MerchantCategory.CLOTHES);
        const rules = createRules({
            maxDiscountPercent: 15,
            allowNegotiation: true,
        });
        it("should approve negotiation when rules allow", () => {
            const result = policy.evaluate(createRequest(10), rules, createCart(1));
            expect(result.approved).toBe(true);
        });
        it("should support up to 15% discount", () => {
            const result = policy.evaluate(createRequest(15), rules, createCart(1));
            expect(result.approved).toBe(true);
            expect(result.finalDiscount).toBe(15);
        });
        it("should allow bundle discount for 3+ items", () => {
            // Even if requested discount exceeds max, 3+ items triggers bundle offer
            const result = policy.evaluate(createRequest(20), rules, createCart(3));
            expect(result.approved).toBe(true);
            expect(result.offerText).toContain("حاجات");
        });
        it("should reject excessive discount request", () => {
            const result = policy.evaluate(createRequest(50), rules, createCart(1));
            expect(result.approved).toBe(false);
            expect(result.finalDiscount).toBeLessThan(50);
        });
        it("should generate Arabic offer text", () => {
            const result = policy.evaluate(createRequest(10), rules, createCart(1));
            expect(result.offerText).toBeTruthy();
            expect(result.offerText.length).toBeGreaterThan(0);
        });
        it("should accept reasonable discount", () => {
            const result = policy.evaluate(createRequest(10), rules, createCart(1));
            expect(result.approved).toBe(true);
        });
    });
    describe("FoodNegotiationPolicy", () => {
        const policy = negotiation_policy_1.NegotiationPolicyFactory.create(enums_1.MerchantCategory.FOOD);
        const rules = createRules({
            maxDiscountPercent: 5,
            allowNegotiation: true,
        });
        it("should reject high discount on food", () => {
            const result = policy.evaluate(createRequest(15), rules, createCart(1));
            expect(result.approved).toBe(false);
        });
        it("should cap food discount to maximum allowed", () => {
            // Food policy caps at 10% internally
            const result = policy.evaluate(createRequest(12), rules, createCart(1));
            expect(result.approved).toBe(false);
            expect(result.offerText).toContain("أكل");
        });
        it("should reject any significant discount attempt", () => {
            const result = policy.evaluate(createRequest(10), rules, createCart(1));
            expect(result.approved).toBe(false);
        });
    });
    describe("SupermarketNegotiationPolicy", () => {
        const policy = negotiation_policy_1.NegotiationPolicyFactory.create(enums_1.MerchantCategory.SUPERMARKET);
        const rules = createRules({
            maxDiscountPercent: 5,
            allowNegotiation: true,
        });
        it("should approve bulk orders (10+ items) with 5% discount", () => {
            const result = policy.evaluate(createRequest(0), rules, createCart(10));
            expect(result.approved).toBe(true);
            expect(result.finalDiscount).toBe(5);
        });
        it("should have fixed price policy for small orders", () => {
            const result = policy.evaluate(createRequest(5), rules, createCart(1));
            expect(result.approved).toBe(false);
            expect(result.offerText).toContain("ثابتة");
        });
        it("should reject high discount request", () => {
            const result = policy.evaluate(createRequest(20), rules, createCart(1));
            expect(result.approved).toBe(false);
        });
        it("should approve zero discount request", () => {
            const result = policy.evaluate(createRequest(0), rules, createCart(1));
            expect(result.approved).toBe(true);
            expect(result.finalDiscount).toBe(0);
        });
    });
    describe("GenericNegotiationPolicy", () => {
        const policy = negotiation_policy_1.NegotiationPolicyFactory.create(enums_1.MerchantCategory.GENERIC);
        const rules = createRules({
            maxDiscountPercent: 10,
            allowNegotiation: true,
        });
        it("should approve negotiation when rules allow", () => {
            const result = policy.evaluate(createRequest(5), rules, createCart(1));
            expect(result.approved).toBe(true);
        });
        it("should support up to 10% discount by default", () => {
            const result = policy.evaluate(createRequest(10), rules, createCart(1));
            expect(result.approved).toBe(true);
            expect(result.finalDiscount).toBe(10);
        });
        it("should reject discount exceeding max", () => {
            const result = policy.evaluate(createRequest(15), rules, createCart(1));
            expect(result.approved).toBe(false);
            expect(result.finalDiscount).toBe(10); // Counter-offer at max
        });
        it("should reject negotiation when rules disable it", () => {
            const noNegotiationRules = createRules({ allowNegotiation: false });
            const result = policy.evaluate(createRequest(5), noNegotiationRules, createCart(1));
            expect(result.approved).toBe(false);
            expect(result.reason).toBe("Negotiation disabled");
        });
    });
});
