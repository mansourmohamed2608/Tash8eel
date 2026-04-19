"use strict";
/**
 * Unit Tests for Customer Reorder Service
 *
 * Tests the customer WhatsApp reorder flow:
 * - Intent detection for reorder phrases (Arabic)
 * - Availability checking with inventory validation
 * - Order confirmation flow
 * - Address handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
const customer_reorder_service_1 = require("../../src/application/services/customer-reorder.service");
describe("CustomerReorderService", () => {
    let service;
    // Mock dependencies
    const mockPool = {
        query: jest.fn(),
    };
    const mockCatalogRepo = {};
    const mockCustomerRepo = {};
    const mockOrderRepo = {};
    beforeEach(() => {
        jest.clearAllMocks();
        service = new customer_reorder_service_1.CustomerReorderService(mockPool, mockCatalogRepo, mockCustomerRepo, mockOrderRepo);
    });
    describe("isReorderRequest", () => {
        describe("should detect valid reorder phrases", () => {
            const validPhrases = [
                "نفس الطلب",
                "نفس طلبي",
                "كرر الطلب",
                "كرر طلبي",
                "عايز نفس الطلب",
                "عايز نفس طلب المرة اللي فاتت",
                "اعمل نفس الطلب",
                "طلبي السابق",
                "الطلب اللي فات",
                "المرة اللي فاتت",
                "الطلب الأخير",
                "اطلب زي الاول",
                "نفس المرة اللي فاتت",
                "نفسه",
                "كرره",
                "زي الاول",
                "نفس",
            ];
            validPhrases.forEach((phrase) => {
                it(`should detect: "${phrase}"`, () => {
                    expect(service.isReorderRequest(phrase)).toBe(true);
                });
            });
        });
        describe("should NOT detect non-reorder phrases", () => {
            const invalidPhrases = [
                "السلام عليكم",
                "عايز تيشيرت",
                "كم سعر الفستان",
                "الطلب رقم 123",
                "ايه آخر الاخبار",
                "طلب جديد",
                "عايز اطلب حاجة",
                "",
                "   ",
            ];
            invalidPhrases.forEach((phrase) => {
                it(`should not detect: "${phrase || "(empty)"}"`, () => {
                    expect(service.isReorderRequest(phrase)).toBe(false);
                });
            });
        });
        it("should handle leading/trailing whitespace", () => {
            expect(service.isReorderRequest("  نفس الطلب  ")).toBe(true);
            expect(service.isReorderRequest("\n\nكرر طلبي\n")).toBe(true);
        });
    });
    describe("checkReorderAvailability", () => {
        const merchantId = "test-merchant-123";
        const customerPhone = "+201234567890";
        it("should return hasLastOrder=false when customer has no previous orders", async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const result = await service.checkReorderAvailability(merchantId, customerPhone);
            expect(result.success).toBe(false);
            expect(result.hasLastOrder).toBe(false);
            expect(result.errorAr).toContain("مفيش طلبات سابقة");
        });
        it("should return order details when customer has previous order", async () => {
            // Mock last order query
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "order-123",
                        order_number: "ORD001",
                        total: 500,
                        created_at: new Date("2024-01-15"),
                        shipping_address_full: "15 شارع التحرير، القاهرة",
                        shipping_address_city: "القاهرة",
                        shipping_address_area: "وسط البلد",
                        shipping_address_street: "شارع التحرير",
                        phone: customerPhone,
                        items: [
                            {
                                catalogItemId: "cat-1",
                                sku: "SKU001",
                                name: "T-Shirt",
                                nameAr: "تيشيرت",
                                quantity: 2,
                                price: 150,
                            },
                            {
                                catalogItemId: "cat-2",
                                sku: "SKU002",
                                name: "Pants",
                                nameAr: "بنطلون",
                                quantity: 1,
                                price: 200,
                            },
                        ],
                    },
                ],
            });
            // Mock catalog item queries (one per item)
            mockPool.query
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "cat-1",
                        sku: "SKU001",
                        name: "T-Shirt",
                        name_ar: "تيشيرت",
                        price: 160,
                        current_stock: 10,
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "cat-2",
                        sku: "SKU002",
                        name: "Pants",
                        name_ar: "بنطلون",
                        price: 200,
                        current_stock: 5,
                    },
                ],
            });
            const result = await service.checkReorderAvailability(merchantId, customerPhone);
            expect(result.success).toBe(true);
            expect(result.hasLastOrder).toBe(true);
            expect(result.lastOrderNumber).toBe("ORD001");
            expect(result.items.length).toBe(2);
            expect(result.allAvailable).toBe(true);
            expect(result.unavailableItems.length).toBe(0);
            expect(result.address?.full).toBe("15 شارع التحرير، القاهرة");
        });
        it("should mark items as unavailable when stock is insufficient", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "order-123",
                        order_number: "ORD002",
                        total: 300,
                        created_at: new Date(),
                        shipping_address_full: "Test Address",
                        items: [
                            {
                                catalogItemId: "cat-1",
                                sku: "SKU001",
                                name: "T-Shirt",
                                nameAr: "تيشيرت",
                                quantity: 5,
                                price: 100,
                            },
                        ],
                    },
                ],
            });
            // Only 2 in stock, need 5
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "cat-1",
                        sku: "SKU001",
                        name: "T-Shirt",
                        name_ar: "تيشيرت",
                        price: 100,
                        current_stock: 2,
                    },
                ],
            });
            const result = await service.checkReorderAvailability(merchantId, customerPhone);
            expect(result.success).toBe(true);
            expect(result.allAvailable).toBe(false);
            expect(result.unavailableItems.length).toBe(1);
            expect(result.unavailableItems[0].currentStock).toBe(2);
            expect(result.unavailableItems[0].quantity).toBe(5);
        });
        it("should mark item as unavailable when no longer in catalog", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "order-123",
                        order_number: "ORD003",
                        total: 100,
                        created_at: new Date(),
                        shipping_address_full: null,
                        items: [
                            {
                                catalogItemId: "cat-deleted",
                                sku: "DELETED",
                                name: "Old Item",
                                nameAr: "منتج قديم",
                                quantity: 1,
                                price: 100,
                            },
                        ],
                    },
                ],
            });
            // Item no longer exists
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const result = await service.checkReorderAvailability(merchantId, customerPhone);
            expect(result.success).toBe(true);
            expect(result.unavailableItems.length).toBe(1);
            expect(result.unavailableItems[0].available).toBe(false);
        });
        it("should use current prices, not historical prices", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "order-123",
                        order_number: "ORD004",
                        total: 100,
                        created_at: new Date(),
                        shipping_address_full: null,
                        items: [
                            {
                                catalogItemId: "cat-1",
                                sku: "SKU001",
                                name: "Item",
                                nameAr: "منتج",
                                quantity: 1,
                                price: 100,
                            }, // Old price
                        ],
                    },
                ],
            });
            // Current price is higher
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "cat-1",
                        sku: "SKU001",
                        name: "Item",
                        name_ar: "منتج",
                        price: 150,
                        current_stock: 10,
                    },
                ],
            });
            const result = await service.checkReorderAvailability(merchantId, customerPhone);
            expect(result.items[0].price).toBe(150); // Should use current price
            expect(result.total).toBe(150);
        });
    });
    describe("generateReorderConfirmationMessage", () => {
        it("should generate message with all available items", () => {
            const result = {
                success: true,
                hasLastOrder: true,
                lastOrderId: "order-1",
                lastOrderNumber: "ORD001",
                items: [
                    {
                        catalogItemId: "cat-1",
                        sku: "SKU1",
                        name: "Item 1",
                        nameAr: "منتج ١",
                        quantity: 2,
                        price: 100,
                        available: true,
                        currentStock: 10,
                    },
                    {
                        catalogItemId: "cat-2",
                        sku: "SKU2",
                        name: "Item 2",
                        nameAr: "منتج ٢",
                        quantity: 1,
                        price: 50,
                        available: true,
                        currentStock: 5,
                    },
                ],
                allAvailable: true,
                unavailableItems: [],
                total: 250,
                address: {
                    full: "15 شارع X، القاهرة",
                    city: "القاهرة",
                    area: "",
                    street: "",
                },
            };
            const message = service.generateReorderConfirmationMessage(result);
            expect(message).toContain("طلبك السابق");
            expect(message).toContain("منتج ١");
            expect(message).toContain("منتج ٢");
            expect(message).toContain("250 ج.م");
            expect(message).toContain("15 شارع X، القاهرة");
            expect(message).toContain("تمام");
            expect(message).not.toContain("مش متوفر");
        });
        it("should include unavailable items warning", () => {
            const result = {
                success: true,
                hasLastOrder: true,
                items: [
                    {
                        catalogItemId: "cat-1",
                        sku: "SKU1",
                        name: "Item 1",
                        nameAr: "منتج متوفر",
                        quantity: 1,
                        price: 100,
                        available: true,
                        currentStock: 10,
                    },
                ],
                allAvailable: false,
                unavailableItems: [
                    {
                        catalogItemId: "cat-2",
                        sku: "SKU2",
                        name: "Item 2",
                        nameAr: "منتج نفذ",
                        quantity: 2,
                        price: 50,
                        available: false,
                        currentStock: 0,
                    },
                    {
                        catalogItemId: "cat-3",
                        sku: "SKU3",
                        name: "Item 3",
                        nameAr: "منتج قليل",
                        quantity: 5,
                        price: 30,
                        available: false,
                        currentStock: 2,
                    },
                ],
                total: 100,
            };
            const message = service.generateReorderConfirmationMessage(result);
            expect(message).toContain("مش متوفر");
            expect(message).toContain("منتج نفذ");
            expect(message).toContain("نفذ");
            expect(message).toContain("منتج قليل");
            expect(message).toContain("متوفر 2 بس");
        });
        it("should ask for address when not available", () => {
            const result = {
                success: true,
                hasLastOrder: true,
                items: [
                    {
                        catalogItemId: "cat-1",
                        sku: "SKU1",
                        name: "Item",
                        nameAr: "منتج",
                        quantity: 1,
                        price: 100,
                        available: true,
                        currentStock: 10,
                    },
                ],
                allAvailable: true,
                unavailableItems: [],
                total: 100,
                address: undefined,
            };
            const message = service.generateReorderConfirmationMessage(result);
            expect(message).toContain("ابعتلي عنوان التوصيل");
            expect(message).not.toContain("العنوان صح");
        });
        it("should return error message when no last order", () => {
            const result = {
                success: false,
                hasLastOrder: false,
                items: [],
                allAvailable: false,
                unavailableItems: [],
                total: 0,
                errorAr: "مفيش طلبات سابقة ليك.",
            };
            const message = service.generateReorderConfirmationMessage(result);
            expect(message).toBe("مفيش طلبات سابقة ليك.");
        });
    });
    describe("confirmReorder", () => {
        const merchantId = "test-merchant";
        const customerPhone = "+201234567890";
        it("should create order from available items", async () => {
            // Mock checkReorderAvailability call
            mockPool.query
                // Last order query
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "old-order",
                        order_number: "OLD001",
                        total: 200,
                        created_at: new Date(),
                        items: [
                            {
                                catalogItemId: "cat-1",
                                sku: "SKU1",
                                name: "Item",
                                nameAr: "منتج",
                                quantity: 2,
                                price: 100,
                            },
                        ],
                    },
                ],
            })
                // Catalog check
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "cat-1",
                        sku: "SKU1",
                        name: "Item",
                        name_ar: "منتج",
                        price: 100,
                        current_stock: 10,
                    },
                ],
            })
                // Customer ID lookup
                .mockResolvedValueOnce({
                rows: [{ id: "customer-123" }],
            })
                // Order insert
                .mockResolvedValueOnce({
                rows: [{ id: "new-order-id", order_number: "R12345", total: 200 }],
            })
                // Inventory update
                .mockResolvedValueOnce({ rows: [] });
            const result = await service.confirmReorder(merchantId, customerPhone, {
                full: "New Address",
            });
            expect(result.success).toBe(true);
            expect(result.orderId).toBe("new-order-id");
            expect(result.orderNumber).toBe("R12345");
        });
        it("should fail when no available items", async () => {
            mockPool.query
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "old-order",
                        items: [{ catalogItemId: "cat-1", quantity: 5 }],
                    },
                ],
            })
                // Item out of stock
                .mockResolvedValueOnce({
                rows: [{ id: "cat-1", current_stock: 0, price: 100 }],
            });
            const result = await service.confirmReorder(merchantId, customerPhone);
            expect(result.success).toBe(false);
            expect(result.errorAr).toContain("مش متوفرة");
        });
        it("should fail when customer not found", async () => {
            mockPool.query
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: "old-order",
                        items: [{ catalogItemId: "cat-1", quantity: 1 }],
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [{ id: "cat-1", current_stock: 10, price: 100 }],
            })
                // Customer not found
                .mockResolvedValueOnce({ rows: [] });
            const result = await service.confirmReorder(merchantId, customerPhone);
            expect(result.success).toBe(false);
            expect(result.errorAr).toContain("العميل");
        });
    });
});
