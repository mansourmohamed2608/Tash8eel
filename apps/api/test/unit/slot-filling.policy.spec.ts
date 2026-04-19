import {
  SlotFillingPolicyFactory,
  ClothesSlotFillingPolicy,
  FoodSlotFillingPolicy,
  SupermarketSlotFillingPolicy,
  GenericSlotFillingPolicy,
} from "../../src/application/policies/slot-filling.policy";
import { MerchantCategory } from "../../src/shared/constants/enums";
import { Cart, CollectedInfo } from "../../src/shared/schemas";

describe("SlotFillingPolicy", () => {
  // Create mock policies for testing without DI container
  const clothesPolicy = new ClothesSlotFillingPolicy();
  const foodPolicy = new FoodSlotFillingPolicy();
  const supermarketPolicy = new SupermarketSlotFillingPolicy();
  const genericPolicy = new GenericSlotFillingPolicy();

  const factory = new SlotFillingPolicyFactory(
    clothesPolicy,
    foodPolicy,
    supermarketPolicy,
    genericPolicy,
  );

  const createEmptyCart = (): Cart => ({
    items: [],
    subtotal: 0,
    discount: 0,
    deliveryFee: 0,
    total: 0,
  });

  const createCartWithItems = (): Cart => ({
    items: [{ name: "تيشيرت", quantity: 2, unitPrice: 100, lineTotal: 200 }],
    subtotal: 200,
    discount: 0,
    deliveryFee: 30,
    total: 230,
  });

  const createEmptyCollectedInfo = (): CollectedInfo => ({});

  describe("ClothesSlotFillingPolicy", () => {
    it("should require product, size, color, name, phone, and address", () => {
      const policy = factory.getPolicy(MerchantCategory.CLOTHES);
      const slots = policy.getRequiredSlots();
      expect(slots).toContain("product");
      expect(slots).toContain("size");
      expect(slots).toContain("color");
      expect(slots).toContain("customer_name");
      expect(slots).toContain("phone");
      expect(slots).toContain("address_city");
    });

    it("should return product as missing when cart is empty", () => {
      const policy = factory.getPolicy(MerchantCategory.CLOTHES);
      const result = policy.evaluate(
        createEmptyCart(),
        createEmptyCollectedInfo(),
        [],
      );
      expect(result.missingSlots).toContain("product");
      expect(result.isComplete).toBe(false);
    });

    it("should return customer_name as missing when not provided", () => {
      const policy = factory.getPolicy(MerchantCategory.CLOTHES);
      const cart = createCartWithItems();
      const result = policy.evaluate(cart, createEmptyCollectedInfo(), []);
      expect(result.missingSlots).toContain("customer_name");
    });

    it("should be complete when all slots are filled", () => {
      const policy = factory.getPolicy(MerchantCategory.CLOTHES);
      const cart: Cart = {
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
      const collectedInfo: CollectedInfo = {
        customerName: "أحمد محمد",
        phone: "01234567890",
        address: {
          city: "القاهرة",
          area: "المعادي",
          street: "شارع 9",
          building: "15",
          confidence: 1,
          missing_fields: [],
        },
      };
      const result = policy.evaluate(cart, collectedInfo, []);
      expect(result.isComplete).toBe(true);
      expect(result.missingSlots).toHaveLength(0);
    });

    it("should generate Arabic question for missing slot", () => {
      const policy = factory.getPolicy(MerchantCategory.CLOTHES);
      const result = policy.evaluate(
        createEmptyCart(),
        createEmptyCollectedInfo(),
        [],
      );
      expect(result.nextQuestion).toBeTruthy();
      expect(result.nextQuestion.length).toBeGreaterThan(0);
    });
  });

  describe("FoodSlotFillingPolicy", () => {
    it("should have lower address requirements than clothes", () => {
      const policy = factory.getPolicy(MerchantCategory.FOOD);
      const slots = policy.getRequiredSlots();
      expect(slots).not.toContain("address_building");
      expect(slots).toContain("product");
      expect(slots).toContain("customer_name");
    });

    it("should be complete with full address info for food", () => {
      const policy = factory.getPolicy(MerchantCategory.FOOD);
      const cart: Cart = {
        items: [{ name: "بيتزا", quantity: 1, unitPrice: 75, lineTotal: 75 }],
        subtotal: 75,
        discount: 0,
        deliveryFee: 20,
        total: 95,
      };
      const collectedInfo: CollectedInfo = {
        customerName: "محمد",
        phone: "01234567890",
        address: {
          city: "القاهرة",
          area: "مدينة نصر",
          street: "شارع الطيران",
          building: "10",
          confidence: 1,
          missing_fields: [],
        },
      };
      const result = policy.evaluate(cart, collectedInfo, []);
      // Food policy includes building in priority, so we check it's complete
      expect(result.isComplete).toBe(true);
    });
  });

  describe("SupermarketSlotFillingPolicy", () => {
    it("should require substitution preference", () => {
      const policy = factory.getPolicy(MerchantCategory.SUPERMARKET);
      const cart: Cart = {
        items: [{ name: "لبن", quantity: 2, unitPrice: 30, lineTotal: 60 }],
        subtotal: 60,
        discount: 0,
        deliveryFee: 20,
        total: 80,
      };
      const collectedInfo: CollectedInfo = {
        customerName: "أحمد",
        phone: "01234567890",
        address: {
          city: "القاهرة",
          area: "التجمع",
          street: "شارع التسعين",
          building: "10",
          confidence: 1,
          missing_fields: [],
        },
      };
      const result = policy.evaluate(cart, collectedInfo, []);
      expect(result.missingSlots).toContain("substitution_preference");
    });

    it("should be complete with substitution preference set", () => {
      const policy = factory.getPolicy(MerchantCategory.SUPERMARKET);
      const cart: Cart = {
        items: [{ name: "لبن", quantity: 2, unitPrice: 30, lineTotal: 60 }],
        subtotal: 60,
        discount: 0,
        deliveryFee: 20,
        total: 80,
      };
      const collectedInfo: CollectedInfo = {
        customerName: "أحمد",
        phone: "01234567890",
        substitutionAllowed: true,
        address: {
          city: "القاهرة",
          area: "التجمع",
          street: "شارع التسعين",
          building: "10",
          confidence: 1,
          missing_fields: [],
        },
      };
      const result = policy.evaluate(cart, collectedInfo, []);
      expect(result.missingSlots).not.toContain("substitution_preference");
      expect(result.isComplete).toBe(true);
    });
  });

  describe("GenericSlotFillingPolicy", () => {
    it("should have minimal required slots", () => {
      const policy = factory.getPolicy(MerchantCategory.GENERIC);
      const slots = policy.getRequiredSlots();
      expect(slots).toContain("product");
      expect(slots).toContain("customer_name");
      expect(slots).toContain("phone");
      expect(slots).toContain("address_city");
      expect(slots).toContain("address_area");
    });

    it("should be complete with basic info", () => {
      const policy = factory.getPolicy(MerchantCategory.GENERIC);
      const cart: Cart = {
        items: [{ name: "منتج", quantity: 1, unitPrice: 100, lineTotal: 100 }],
        subtotal: 100,
        discount: 0,
        deliveryFee: 30,
        total: 130,
      };
      const collectedInfo: CollectedInfo = {
        customerName: "أحمد",
        phone: "01234567890",
        address: {
          city: "القاهرة",
          area: "المعادي",
          street: "شارع 9",
          building: "15",
          confidence: 1,
          missing_fields: [],
        },
      };
      const result = policy.evaluate(cart, collectedInfo, []);
      expect(result.isComplete).toBe(true);
    });
  });

  describe("SlotFillingPolicyFactory", () => {
    it("should return correct policy for each category", () => {
      expect(factory.getPolicy(MerchantCategory.CLOTHES)).toBeInstanceOf(
        ClothesSlotFillingPolicy,
      );
      expect(factory.getPolicy(MerchantCategory.FOOD)).toBeInstanceOf(
        FoodSlotFillingPolicy,
      );
      expect(factory.getPolicy(MerchantCategory.SUPERMARKET)).toBeInstanceOf(
        SupermarketSlotFillingPolicy,
      );
      expect(factory.getPolicy(MerchantCategory.GENERIC)).toBeInstanceOf(
        GenericSlotFillingPolicy,
      );
    });

    it("should return generic policy for unknown category", () => {
      const policy = factory.getPolicy("UNKNOWN" as MerchantCategory);
      expect(policy).toBeInstanceOf(GenericSlotFillingPolicy);
    });
  });
});
