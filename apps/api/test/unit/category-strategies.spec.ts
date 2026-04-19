import {
  ClothesStrategy,
  FoodStrategy,
  SupermarketStrategy,
  GenericStrategy,
} from "../../src/categories";
import { MerchantCategory } from "../../src/shared/constants/enums";

describe("Category Strategies", () => {
  describe("ClothesStrategy", () => {
    const strategy = new ClothesStrategy();

    it("should have correct category", () => {
      expect(strategy.category).toBe(MerchantCategory.CLOTHES);
    });

    it("should require size and color variants for items", () => {
      const item = { id: "1", name: "T-Shirt", variants: [] };
      const required = strategy.getRequiredVariants(item as any);
      expect(required).toContain("size");
      expect(required).toContain("color");
    });

    it("should return required slots", () => {
      const slots = strategy.getRequiredSlots();
      expect(slots).toContain("customerName");
      expect(slots).toContain("phone");
      expect(slots).toContain("address");
    });

    it("should identify missing customer info", () => {
      const conversation = {
        collectedInfo: { customerName: "Ahmed" },
        cart: { items: [] },
      };
      const missing = strategy.isMissingInfo(conversation as any);
      expect(missing).toContain("phone");
      expect(missing).toContain("address");
      expect(missing).not.toContain("customerName");
    });

    it("should return Arabic greeting template", () => {
      const greeting = strategy.getGreetingTemplate();
      expect(greeting).toContain("أهلاً");
      expect(greeting).toContain("تيشيرتات");
    });
  });

  describe("FoodStrategy", () => {
    const strategy = new FoodStrategy();

    it("should have correct category", () => {
      expect(strategy.category).toBe(MerchantCategory.FOOD);
    });

    it("should require size if item has size variant", () => {
      const item = {
        id: "1",
        name: "Pizza",
        variants: [{ name: "size", values: ["small", "medium", "large"] }],
        options: [],
      };
      const required = strategy.getRequiredVariants(item as any);
      expect(required).toContain("size");
    });

    it("should include deliveryTime in required slots", () => {
      const slots = strategy.getRequiredSlots();
      expect(slots).toContain("deliveryTime");
    });

    it("should have food-specific greeting", () => {
      const greeting = strategy.getGreetingTemplate();
      expect(greeting).toContain("🍔");
      expect(greeting).toContain("منيو");
    });

    it("should include delivery time estimate in confirmation", () => {
      const confirmation = strategy.getConfirmationTemplate();
      expect(confirmation).toContain("30-45 دقيقة");
    });
  });

  describe("SupermarketStrategy", () => {
    const strategy = new SupermarketStrategy();

    it("should have correct category", () => {
      expect(strategy.category).toBe(MerchantCategory.SUPERMARKET);
    });

    it("should always require quantity", () => {
      const item = { id: "1", name: "Milk", variants: [] };
      const required = strategy.getRequiredVariants(item as any);
      expect(required).toContain("quantity");
    });

    it("should require delivery slot", () => {
      const slots = strategy.getRequiredSlots();
      expect(slots).toContain("deliverySlot");
    });

    it("should have substitution notice in confirmation", () => {
      const confirmation = strategy.getConfirmationTemplate();
      expect(confirmation).toContain("بدائل");
    });
  });

  describe("GenericStrategy", () => {
    const strategy = new GenericStrategy();

    it("should have correct category", () => {
      expect(strategy.category).toBe(MerchantCategory.GENERIC);
    });

    it("should only require variants with values", () => {
      const item = {
        id: "1",
        name: "Product",
        variants: [
          { name: "optional", values: [] },
          { name: "required", values: ["value1", "value2"] },
        ],
      };
      const required = strategy.getRequiredVariants(item as any);
      expect(required).toContain("required");
      expect(required).not.toContain("optional");
    });

    it("should have basic required slots", () => {
      const slots = strategy.getRequiredSlots();
      expect(slots).toHaveLength(3);
      expect(slots).toContain("customerName");
      expect(slots).toContain("phone");
      expect(slots).toContain("address");
    });
  });
});
