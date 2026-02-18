import { InventoryPolicies } from "../inventory.policies";

describe("InventoryPolicies", () => {
  describe("isLowStock", () => {
    it("should return true when stock is at threshold", () => {
      expect(InventoryPolicies.isLowStock(5, 5)).toBe(true);
    });

    it("should return true when stock is below threshold", () => {
      expect(InventoryPolicies.isLowStock(3, 5)).toBe(true);
    });

    it("should return false when stock is above threshold", () => {
      expect(InventoryPolicies.isLowStock(10, 5)).toBe(false);
    });

    it("should use default threshold of 5 when not specified", () => {
      expect(InventoryPolicies.isLowStock(4)).toBe(true);
      expect(InventoryPolicies.isLowStock(6)).toBe(false);
    });
  });

  describe("isOutOfStock", () => {
    it("should return true when quantity is 0", () => {
      expect(InventoryPolicies.isOutOfStock(0)).toBe(true);
    });

    it("should return true when quantity is negative", () => {
      expect(InventoryPolicies.isOutOfStock(-1)).toBe(true);
    });

    it("should return false when quantity is positive", () => {
      expect(InventoryPolicies.isOutOfStock(1)).toBe(false);
    });
  });

  describe("canReserve", () => {
    it("should allow reservation when sufficient stock", () => {
      expect(InventoryPolicies.canReserve(10, 5)).toBe(true);
    });

    it("should allow reservation when exact stock available", () => {
      expect(InventoryPolicies.canReserve(5, 5)).toBe(true);
    });

    it("should deny reservation when insufficient stock", () => {
      expect(InventoryPolicies.canReserve(3, 5)).toBe(false);
    });
  });

  describe("isReservationExpired", () => {
    it("should return true for past date", () => {
      const past = new Date(Date.now() - 60000);
      expect(InventoryPolicies.isReservationExpired(past)).toBe(true);
    });

    it("should return false for future date", () => {
      const future = new Date(Date.now() + 60000);
      expect(InventoryPolicies.isReservationExpired(future)).toBe(false);
    });
  });

  describe("calculateReorderQuantity", () => {
    it("should calculate reorder based on average daily sales", () => {
      const averageDailySales = 10;
      const leadTimeDays = 7;
      const safetyStockDays = 3;

      const result = InventoryPolicies.calculateReorderQuantity(
        averageDailySales,
        leadTimeDays,
        safetyStockDays,
      );

      // (7 + 3) * 10 = 100
      expect(result).toBe(100);
    });
  });

  describe("getSubstitutionCandidates", () => {
    const catalog = [
      { id: "1", name: "Product A", category: "shirts", price: 100, stock: 10 },
      { id: "2", name: "Product B", category: "shirts", price: 120, stock: 5 },
      { id: "3", name: "Product C", category: "shirts", price: 200, stock: 8 },
      { id: "4", name: "Product D", category: "pants", price: 100, stock: 10 },
      { id: "5", name: "Product E", category: "shirts", price: 110, stock: 0 },
    ];

    it("should return only same-category items", () => {
      const candidates = InventoryPolicies.getSubstitutionCandidates(
        { id: "1", category: "shirts", price: 100 },
        catalog,
        1.5,
      );

      expect(candidates.every((c) => c.category === "shirts")).toBe(true);
      expect(candidates.find((c) => c.id === "4")).toBeUndefined();
    });

    it("should exclude out-of-stock items", () => {
      const candidates = InventoryPolicies.getSubstitutionCandidates(
        { id: "1", category: "shirts", price: 100 },
        catalog,
        1.5,
      );

      expect(candidates.find((c) => c.id === "5")).toBeUndefined();
    });

    it("should exclude items exceeding price cap", () => {
      const candidates = InventoryPolicies.getSubstitutionCandidates(
        { id: "1", category: "shirts", price: 100 },
        catalog,
        1.2, // 120% cap = max 120
      );

      expect(candidates.find((c) => c.id === "3")).toBeUndefined(); // 200 > 120
    });

    it("should exclude the original item", () => {
      const candidates = InventoryPolicies.getSubstitutionCandidates(
        { id: "1", category: "shirts", price: 100 },
        catalog,
        2.0,
      );

      expect(candidates.find((c) => c.id === "1")).toBeUndefined();
    });
  });
});
