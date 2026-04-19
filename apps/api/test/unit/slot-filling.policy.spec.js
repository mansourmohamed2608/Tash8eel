"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const slot_filling_policy_1 = require("../../src/application/policies/slot-filling.policy");
const enums_1 = require("../../src/shared/constants/enums");
describe("SlotFillingPolicy", () => {
    // Create mock policies for testing without DI container
    const clothesPolicy = new slot_filling_policy_1.ClothesSlotFillingPolicy();
    const foodPolicy = new slot_filling_policy_1.FoodSlotFillingPolicy();
    const supermarketPolicy = new slot_filling_policy_1.SupermarketSlotFillingPolicy();
    const genericPolicy = new slot_filling_policy_1.GenericSlotFillingPolicy();
    const factory = new slot_filling_policy_1.SlotFillingPolicyFactory(clothesPolicy, foodPolicy, supermarketPolicy, genericPolicy);
    const createEmptyCart = () => ({
        items: [],
        subtotal: 0,
        discount: 0,
        deliveryFee: 0,
        total: 0,
    });
    const createCartWithItems = () => ({
        items: [{ name: "تيشيرت", quantity: 2, unitPrice: 100, lineTotal: 200 }],
        subtotal: 200,
        discount: 0,
        deliveryFee: 30,
        total: 230,
    });
    const createEmptyCollectedInfo = () => ({});
    describe("ClothesSlotFillingPolicy", () => {
        it("should require product, size, color, name, phone, and address", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.CLOTHES);
            const slots = policy.getRequiredSlots();
            expect(slots).toContain("product");
            expect(slots).toContain("size");
            expect(slots).toContain("color");
            expect(slots).toContain("customer_name");
            expect(slots).toContain("phone");
            expect(slots).toContain("address_city");
        });
        it("should return product as missing when cart is empty", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.CLOTHES);
            const result = policy.evaluate(createEmptyCart(), createEmptyCollectedInfo(), []);
            expect(result.missingSlots).toContain("product");
            expect(result.isComplete).toBe(false);
        });
        it("should return customer_name as missing when not provided", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.CLOTHES);
            const cart = createCartWithItems();
            const result = policy.evaluate(cart, createEmptyCollectedInfo(), []);
            expect(result.missingSlots).toContain("customer_name");
        });
        it("should be complete when all slots are filled", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.CLOTHES);
            const cart = {
                items: [
                    {
                        name: "تيشيرت",
                        quantity: 2,
                        unitPrice: 100,
                        lineTotal: 200,
                        variant: { size: "L", color: "أبيض" },
                    },
                ],
                subtotal: 200,
                discount: 0,
                deliveryFee: 30,
                total: 230,
            };
            const collectedInfo = {
                customerName: "أحمد محمد",
                phone: "01234567890",
                address: {
                    city: "القاهرة",
                    area: "المعادي",
                    street: "شارع 9",
                    building: "15",
                },
            };
            const result = policy.evaluate(cart, collectedInfo, []);
            expect(result.isComplete).toBe(true);
            expect(result.missingSlots).toHaveLength(0);
        });
        it("should generate Arabic question for missing slot", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.CLOTHES);
            const result = policy.evaluate(createEmptyCart(), createEmptyCollectedInfo(), []);
            expect(result.nextQuestion).toBeTruthy();
            expect(result.nextQuestion.length).toBeGreaterThan(0);
        });
    });
    describe("FoodSlotFillingPolicy", () => {
        it("should have lower address requirements than clothes", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.FOOD);
            const slots = policy.getRequiredSlots();
            expect(slots).not.toContain("address_building");
            expect(slots).toContain("product");
            expect(slots).toContain("customer_name");
        });
        it("should be complete with full address info for food", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.FOOD);
            const cart = {
                items: [{ name: "بيتزا", quantity: 1, unitPrice: 75, lineTotal: 75 }],
                subtotal: 75,
                discount: 0,
                deliveryFee: 20,
                total: 95,
            };
            const collectedInfo = {
                customerName: "محمد",
                phone: "01234567890",
                address: {
                    city: "القاهرة",
                    area: "مدينة نصر",
                    street: "شارع الطيران",
                    building: "10",
                },
            };
            const result = policy.evaluate(cart, collectedInfo, []);
            // Food policy includes building in priority, so we check it's complete
            expect(result.isComplete).toBe(true);
        });
    });
    describe("SupermarketSlotFillingPolicy", () => {
        it("should require substitution preference", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.SUPERMARKET);
            const cart = {
                items: [{ name: "لبن", quantity: 2, unitPrice: 30, lineTotal: 60 }],
                subtotal: 60,
                discount: 0,
                deliveryFee: 20,
                total: 80,
            };
            const collectedInfo = {
                customerName: "أحمد",
                phone: "01234567890",
                address: {
                    city: "القاهرة",
                    area: "التجمع",
                    street: "شارع التسعين",
                    building: "10",
                },
            };
            const result = policy.evaluate(cart, collectedInfo, []);
            expect(result.missingSlots).toContain("substitution_preference");
        });
        it("should be complete with substitution preference set", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.SUPERMARKET);
            const cart = {
                items: [{ name: "لبن", quantity: 2, unitPrice: 30, lineTotal: 60 }],
                subtotal: 60,
                discount: 0,
                deliveryFee: 20,
                total: 80,
            };
            const collectedInfo = {
                customerName: "أحمد",
                phone: "01234567890",
                substitutionAllowed: true,
                address: {
                    city: "القاهرة",
                    area: "التجمع",
                    street: "شارع التسعين",
                    building: "10",
                },
            };
            const result = policy.evaluate(cart, collectedInfo, []);
            expect(result.missingSlots).not.toContain("substitution_preference");
            expect(result.isComplete).toBe(true);
        });
    });
    describe("GenericSlotFillingPolicy", () => {
        it("should have minimal required slots", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.GENERIC);
            const slots = policy.getRequiredSlots();
            expect(slots).toContain("product");
            expect(slots).toContain("customer_name");
            expect(slots).toContain("phone");
            expect(slots).toContain("address_city");
            expect(slots).toContain("address_area");
        });
        it("should be complete with basic info", () => {
            const policy = factory.getPolicy(enums_1.MerchantCategory.GENERIC);
            const cart = {
                items: [{ name: "منتج", quantity: 1, unitPrice: 100, lineTotal: 100 }],
                subtotal: 100,
                discount: 0,
                deliveryFee: 30,
                total: 130,
            };
            const collectedInfo = {
                customerName: "أحمد",
                phone: "01234567890",
                address: {
                    city: "القاهرة",
                    area: "المعادي",
                    street: "شارع 9",
                    building: "15",
                },
            };
            const result = policy.evaluate(cart, collectedInfo, []);
            expect(result.isComplete).toBe(true);
        });
    });
    describe("SlotFillingPolicyFactory", () => {
        it("should return correct policy for each category", () => {
            expect(factory.getPolicy(enums_1.MerchantCategory.CLOTHES)).toBeInstanceOf(slot_filling_policy_1.ClothesSlotFillingPolicy);
            expect(factory.getPolicy(enums_1.MerchantCategory.FOOD)).toBeInstanceOf(slot_filling_policy_1.FoodSlotFillingPolicy);
            expect(factory.getPolicy(enums_1.MerchantCategory.SUPERMARKET)).toBeInstanceOf(slot_filling_policy_1.SupermarketSlotFillingPolicy);
            expect(factory.getPolicy(enums_1.MerchantCategory.GENERIC)).toBeInstanceOf(slot_filling_policy_1.GenericSlotFillingPolicy);
        });
        it("should return generic policy for unknown category", () => {
            const policy = factory.getPolicy("UNKNOWN");
            expect(policy).toBeInstanceOf(slot_filling_policy_1.GenericSlotFillingPolicy);
        });
    });
});
