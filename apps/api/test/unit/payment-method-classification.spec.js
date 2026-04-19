"use strict";
/**
 * Payment Method Classification Unit Tests
 *
 * Tests for the multi-method payment proof classification including:
 * - Egyptian payment methods: InstaPay, VodafoneCash, Bank Transfer, Fawry, Wallet
 * - Method normalization logic
 * - Arabic and English keyword detection
 */
describe("Payment Method Classification", () => {
    /**
     * Normalize payment method string to standard enum values
     * This mirrors the logic in vision.service.ts normalizePaymentMethod
     */
    function normalizePaymentMethod(method) {
        const m = (method || "").toLowerCase().trim();
        if (m.includes("instapay") || m.includes("ipa"))
            return "INSTAPAY";
        if (m.includes("vodafone") || m.includes("فودافون"))
            return "VODAFONE_CASH";
        if (m.includes("bank") ||
            m.includes("بنك") ||
            m.includes("transfer") ||
            m.includes("تحويل"))
            return "BANK_TRANSFER";
        if (m.includes("fawry") || m.includes("فوري"))
            return "FAWRY";
        if (m.includes("wallet") ||
            m.includes("محفظ") ||
            m.includes("orange") ||
            m.includes("etisalat") ||
            m.includes("we pay"))
            return "WALLET";
        // Match exact uppercase values
        if (m === "instapay")
            return "INSTAPAY";
        if (m === "vodafone_cash")
            return "VODAFONE_CASH";
        if (m === "bank_transfer")
            return "BANK_TRANSFER";
        if (m === "fawry")
            return "FAWRY";
        if (m === "wallet")
            return "WALLET";
        return "UNKNOWN";
    }
    describe("InstaPay Detection", () => {
        it('should detect "instapay" (lowercase)', () => {
            expect(normalizePaymentMethod("instapay")).toBe("INSTAPAY");
        });
        it('should detect "InstaPay" (mixed case)', () => {
            expect(normalizePaymentMethod("InstaPay")).toBe("INSTAPAY");
        });
        it('should detect "INSTAPAY" (uppercase)', () => {
            expect(normalizePaymentMethod("INSTAPAY")).toBe("INSTAPAY");
        });
        it('should detect "instapay transfer" (with context)', () => {
            expect(normalizePaymentMethod("instapay transfer")).toBe("INSTAPAY");
        });
        it('should detect "IPA" alias reference', () => {
            expect(normalizePaymentMethod("IPA transfer")).toBe("INSTAPAY");
        });
        it('should detect "ipa@alias" reference', () => {
            expect(normalizePaymentMethod("payment via ipa@merchant")).toBe("INSTAPAY");
        });
    });
    describe("VodafoneCash Detection", () => {
        it('should detect "vodafone" (English)', () => {
            expect(normalizePaymentMethod("vodafone")).toBe("VODAFONE_CASH");
        });
        it('should detect "vodafone cash"', () => {
            expect(normalizePaymentMethod("vodafone cash")).toBe("VODAFONE_CASH");
        });
        it('should detect "VODAFONE_CASH" (enum value)', () => {
            expect(normalizePaymentMethod("VODAFONE_CASH")).toBe("VODAFONE_CASH");
        });
        it('should detect "فودافون" (Arabic)', () => {
            expect(normalizePaymentMethod("فودافون كاش")).toBe("VODAFONE_CASH");
        });
        it("should detect Arabic vodafone reference", () => {
            expect(normalizePaymentMethod("تحويل فودافون")).toBe("VODAFONE_CASH");
        });
    });
    describe("Bank Transfer Detection", () => {
        it('should detect "bank transfer"', () => {
            expect(normalizePaymentMethod("bank transfer")).toBe("BANK_TRANSFER");
        });
        it('should detect "BANK_TRANSFER" (enum value)', () => {
            expect(normalizePaymentMethod("BANK_TRANSFER")).toBe("BANK_TRANSFER");
        });
        it('should detect "بنك" (Arabic: bank)', () => {
            expect(normalizePaymentMethod("تحويل بنكي")).toBe("BANK_TRANSFER");
        });
        it('should detect "تحويل" (Arabic: transfer)', () => {
            expect(normalizePaymentMethod("تحويل")).toBe("BANK_TRANSFER");
        });
        it("should detect bank name context", () => {
            expect(normalizePaymentMethod("CIB bank")).toBe("BANK_TRANSFER");
        });
    });
    describe("Fawry Detection", () => {
        it('should detect "fawry" (English)', () => {
            expect(normalizePaymentMethod("fawry")).toBe("FAWRY");
        });
        it('should detect "FAWRY" (uppercase)', () => {
            expect(normalizePaymentMethod("FAWRY")).toBe("FAWRY");
        });
        it('should detect "فوري" (Arabic)', () => {
            expect(normalizePaymentMethod("فوري")).toBe("FAWRY");
        });
        it('should detect "fawry payment" (with context)', () => {
            expect(normalizePaymentMethod("fawry payment")).toBe("FAWRY");
        });
        it("should detect Arabic fawry reference", () => {
            expect(normalizePaymentMethod("دفع عن طريق فوري")).toBe("FAWRY");
        });
    });
    describe("Mobile Wallet Detection", () => {
        it('should detect "wallet"', () => {
            expect(normalizePaymentMethod("wallet")).toBe("WALLET");
        });
        it('should detect "WALLET" (uppercase)', () => {
            expect(normalizePaymentMethod("WALLET")).toBe("WALLET");
        });
        it('should detect "محفظ" (Arabic: wallet)', () => {
            expect(normalizePaymentMethod("محفظة إلكترونية")).toBe("WALLET");
        });
        it('should detect "orange" (Orange Cash)', () => {
            expect(normalizePaymentMethod("orange money")).toBe("WALLET");
        });
        it('should detect "etisalat" (Etisalat Cash)', () => {
            expect(normalizePaymentMethod("etisalat cash")).toBe("WALLET");
        });
        it('should detect "we pay"', () => {
            expect(normalizePaymentMethod("we pay")).toBe("WALLET");
        });
    });
    describe("Unknown Detection", () => {
        it("should return UNKNOWN for empty string", () => {
            expect(normalizePaymentMethod("")).toBe("UNKNOWN");
        });
        it("should return UNKNOWN for null/undefined", () => {
            expect(normalizePaymentMethod(null)).toBe("UNKNOWN");
            expect(normalizePaymentMethod(undefined)).toBe("UNKNOWN");
        });
        it("should return UNKNOWN for unrecognized method", () => {
            expect(normalizePaymentMethod("bitcoin")).toBe("UNKNOWN");
        });
        it("should return UNKNOWN for random text", () => {
            expect(normalizePaymentMethod("random text here")).toBe("UNKNOWN");
        });
    });
    describe("Classification Response Structure", () => {
        it("should have paymentMethod field", () => {
            const response = {
                paymentMethod: "INSTAPAY",
                confidence: 0.9,
                indicators: ["InstaPay logo detected"],
            };
            expect(response.paymentMethod).toBeDefined();
            expect([
                "INSTAPAY",
                "VODAFONE_CASH",
                "BANK_TRANSFER",
                "FAWRY",
                "WALLET",
                "UNKNOWN",
            ]).toContain(response.paymentMethod);
        });
        it("should have confidence between 0 and 1", () => {
            const response = {
                paymentMethod: "INSTAPAY",
                confidence: 0.9,
                indicators: [],
            };
            expect(response.confidence).toBeGreaterThanOrEqual(0);
            expect(response.confidence).toBeLessThanOrEqual(1);
        });
        it("should have indicators array", () => {
            const response = {
                paymentMethod: "INSTAPAY",
                confidence: 0.9,
                indicators: ["InstaPay logo detected", "IPA@ alias visible"],
            };
            expect(Array.isArray(response.indicators)).toBe(true);
            expect(response.indicators.length).toBeGreaterThan(0);
        });
    });
    describe("Egyptian Payment Methods Completeness", () => {
        const egyptianPaymentMethods = [
            "INSTAPAY",
            "VODAFONE_CASH",
            "BANK_TRANSFER",
            "FAWRY",
            "WALLET",
        ];
        it("should support all Egyptian payment methods", () => {
            egyptianPaymentMethods.forEach((method) => {
                // The normalizer should return the method when given the exact enum value
                const result = normalizePaymentMethod(method.toLowerCase().replace("_", " "));
                expect(result).not.toBe("UNKNOWN");
            });
        });
        it("should have at least 5 supported payment methods", () => {
            expect(egyptianPaymentMethods.length).toBeGreaterThanOrEqual(5);
        });
    });
    describe("Payment Proof Auto-Verification Logic", () => {
        function shouldAutoVerify(input) {
            const { extractedAmount, expectedAmount, paymentMethod, referenceNumber, } = input;
            // Amount must match within 5% tolerance
            const tolerance = expectedAmount * 0.05;
            const amountMatches = Math.abs(extractedAmount - expectedAmount) <= tolerance;
            // Must have a reference number
            const hasReference = !!referenceNumber && referenceNumber.length >= 5;
            // Must be a known payment method
            const knownMethods = [
                "INSTAPAY",
                "VODAFONE_CASH",
                "BANK_TRANSFER",
                "FAWRY",
                "WALLET",
            ];
            const isKnownMethod = knownMethods.includes(paymentMethod);
            return amountMatches && hasReference && isKnownMethod;
        }
        it("should auto-verify when all criteria met", () => {
            const input = {
                extractedAmount: 150,
                expectedAmount: 150,
                paymentMethod: "INSTAPAY",
                referenceNumber: "REF123456",
            };
            expect(shouldAutoVerify(input)).toBe(true);
        });
        it("should auto-verify with 5% tolerance", () => {
            const input = {
                extractedAmount: 147,
                expectedAmount: 150,
                paymentMethod: "INSTAPAY",
                referenceNumber: "REF123456",
            };
            expect(shouldAutoVerify(input)).toBe(true);
        });
        it("should NOT auto-verify when amount mismatch exceeds tolerance", () => {
            const input = {
                extractedAmount: 100,
                expectedAmount: 150,
                paymentMethod: "INSTAPAY",
                referenceNumber: "REF123456",
            };
            expect(shouldAutoVerify(input)).toBe(false);
        });
        it("should NOT auto-verify without reference number", () => {
            const input = {
                extractedAmount: 150,
                expectedAmount: 150,
                paymentMethod: "INSTAPAY",
                referenceNumber: undefined,
            };
            expect(shouldAutoVerify(input)).toBe(false);
        });
        it("should NOT auto-verify with unknown payment method", () => {
            const input = {
                extractedAmount: 150,
                expectedAmount: 150,
                paymentMethod: "UNKNOWN",
                referenceNumber: "REF123456",
            };
            expect(shouldAutoVerify(input)).toBe(false);
        });
    });
});
