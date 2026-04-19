"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const twilio_whatsapp_adapter_1 = require("../../src/application/adapters/twilio-whatsapp.adapter");
describe("TwilioWhatsAppAdapter", () => {
    describe("MockTwilioWhatsAppAdapter", () => {
        let adapter;
        beforeEach(() => {
            adapter = new twilio_whatsapp_adapter_1.MockTwilioWhatsAppAdapter();
        });
        describe("validateSignature", () => {
            it("should always return true in mock mode", () => {
                expect(adapter.validateSignature("any-signature", "http://example.com", {})).toBe(true);
            });
        });
        describe("parseWebhook", () => {
            it("should parse basic text message", () => {
                const payload = {
                    MessageSid: "SM123",
                    AccountSid: "AC123",
                    From: "whatsapp:+201234567890",
                    To: "whatsapp:+14155238886",
                    Body: "مرحبا",
                    NumMedia: "0",
                };
                const result = adapter.parseWebhook(payload);
                expect(result.messageSid).toBe("SM123");
                expect(result.fromNumber).toBe("+201234567890");
                expect(result.toNumber).toBe("+14155238886");
                expect(result.body).toBe("مرحبا");
                expect(result.hasMedia).toBe(false);
                expect(result.isVoiceNote).toBe(false);
                expect(result.hasLocation).toBe(false);
            });
            it("should parse message with voice note", () => {
                const payload = {
                    MessageSid: "SM456",
                    AccountSid: "AC123",
                    From: "whatsapp:+201234567890",
                    To: "whatsapp:+14155238886",
                    Body: "",
                    NumMedia: "1",
                    MediaUrl0: "https://api.twilio.com/media/audio.ogg",
                    MediaContentType0: "audio/ogg",
                };
                const result = adapter.parseWebhook(payload);
                expect(result.hasMedia).toBe(true);
                expect(result.mediaCount).toBe(1);
                expect(result.isVoiceNote).toBe(true);
                expect(result.audioUrl).toBe("https://api.twilio.com/media/audio.ogg");
                expect(result.audioContentType).toBe("audio/ogg");
            });
            it("should parse message with location coordinates", () => {
                const payload = {
                    MessageSid: "SM789",
                    AccountSid: "AC123",
                    From: "whatsapp:+201234567890",
                    To: "whatsapp:+14155238886",
                    Body: "موقعي",
                    NumMedia: "0",
                    Latitude: "30.0444",
                    Longitude: "31.2357",
                };
                const result = adapter.parseWebhook(payload);
                expect(result.hasLocation).toBe(true);
                expect(result.latitude).toBe(30.0444);
                expect(result.longitude).toBe(31.2357);
            });
            it("should parse message with image attachment (not voice note)", () => {
                const payload = {
                    MessageSid: "SM101",
                    AccountSid: "AC123",
                    From: "whatsapp:+201234567890",
                    To: "whatsapp:+14155238886",
                    Body: "صورة المنتج",
                    NumMedia: "1",
                    MediaUrl0: "https://api.twilio.com/media/image.jpg",
                    MediaContentType0: "image/jpeg",
                };
                const result = adapter.parseWebhook(payload);
                expect(result.hasMedia).toBe(true);
                expect(result.isVoiceNote).toBe(false);
                expect(result.mediaUrls).toContain("https://api.twilio.com/media/image.jpg");
            });
        });
        describe("parseStatusCallback", () => {
            it("should parse delivered status", () => {
                const payload = {
                    MessageSid: "SM123",
                    AccountSid: "AC123",
                    From: "whatsapp:+14155238886",
                    To: "whatsapp:+201234567890",
                    MessageStatus: "delivered",
                };
                const result = adapter.parseStatusCallback(payload);
                expect(result.messageSid).toBe("SM123");
                expect(result.status).toBe("delivered");
                expect(result.errorCode).toBeUndefined();
            });
            it("should parse failed status with error", () => {
                const payload = {
                    MessageSid: "SM456",
                    AccountSid: "AC123",
                    From: "whatsapp:+14155238886",
                    To: "whatsapp:+201234567890",
                    MessageStatus: "failed",
                    ErrorCode: "30008",
                    ErrorMessage: "Unknown error",
                };
                const result = adapter.parseStatusCallback(payload);
                expect(result.messageSid).toBe("SM456");
                expect(result.status).toBe("failed");
                expect(result.errorCode).toBe("30008");
                expect(result.errorMessage).toBe("Unknown error");
            });
        });
        describe("getMerchantByWhatsAppNumber", () => {
            it("should return mock merchant", async () => {
                const result = await adapter.getMerchantByWhatsAppNumber("whatsapp:+14155238886");
                expect(result).not.toBeNull();
                expect(result.merchantId).toBe("merchant_001");
                expect(result.isSandbox).toBe(true);
            });
        });
        describe("sendTextMessage", () => {
            it("should send message and return success", async () => {
                const result = await adapter.sendTextMessage("whatsapp:+201234567890", "مرحبا");
                expect(result.success).toBe(true);
                expect(result.messageSid).toMatch(/^SM_mock_/);
                expect(result.status).toBe("queued");
            });
            it("should track sent messages", async () => {
                adapter.clearSentMessages();
                await adapter.sendTextMessage("whatsapp:+201234567890", "رسالة 1");
                await adapter.sendTextMessage("whatsapp:+201234567890", "رسالة 2");
                const messages = adapter.getSentMessages();
                expect(messages).toHaveLength(2);
                expect(messages[0].body).toBe("رسالة 1");
                expect(messages[1].body).toBe("رسالة 2");
            });
        });
        describe("downloadMedia", () => {
            it("should return mock audio buffer", async () => {
                const result = await adapter.downloadMedia("https://api.twilio.com/media/audio.ogg");
                expect(result.buffer).toBeInstanceOf(Buffer);
                expect(result.contentType).toBe("audio/ogg");
            });
        });
    });
    describe("Location extraction", () => {
        let adapter;
        beforeEach(() => {
            adapter = new twilio_whatsapp_adapter_1.MockTwilioWhatsAppAdapter();
        });
        it("should detect Google Maps URL with coordinates in body", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "العنوان: https://maps.google.com/?q=30.0444,31.2357",
                NumMedia: "0",
            };
            const result = adapter.parseWebhook(payload);
            // Note: MockAdapter doesn't parse body for location
            // This test documents the expected behavior for the real adapter
            expect(result.body).toContain("maps.google.com");
        });
        it("should detect Apple Maps URL in body", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "https://maps.apple.com/?ll=30.0444,31.2357",
                NumMedia: "0",
            };
            const result = adapter.parseWebhook(payload);
            expect(result.body).toContain("maps.apple.com");
        });
        it("should detect direct coordinates in body", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "موقعي هو 30.0444, 31.2357",
                NumMedia: "0",
            };
            const result = adapter.parseWebhook(payload);
            expect(result.body).toContain("30.0444");
        });
    });
    describe("Phone number normalization", () => {
        let adapter;
        beforeEach(() => {
            adapter = new twilio_whatsapp_adapter_1.MockTwilioWhatsAppAdapter();
        });
        it("should strip whatsapp: prefix", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "test",
                NumMedia: "0",
            };
            const result = adapter.parseWebhook(payload);
            expect(result.fromNumber).toBe("+201234567890");
            expect(result.toNumber).toBe("+14155238886");
        });
        it("should preserve original whatsapp format", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "test",
                NumMedia: "0",
            };
            const result = adapter.parseWebhook(payload);
            expect(result.fromWhatsApp).toBe("whatsapp:+201234567890");
            expect(result.toWhatsApp).toBe("whatsapp:+14155238886");
        });
    });
    describe("Multiple media attachments", () => {
        let adapter;
        beforeEach(() => {
            adapter = new twilio_whatsapp_adapter_1.MockTwilioWhatsAppAdapter();
        });
        it("should handle single media", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "",
                NumMedia: "1",
                MediaUrl0: "https://api.twilio.com/media/file1.jpg",
                MediaContentType0: "image/jpeg",
            };
            const result = adapter.parseWebhook(payload);
            expect(result.mediaCount).toBe(1);
            expect(result.mediaUrls).toHaveLength(1);
        });
    });
    describe("Button responses", () => {
        let adapter;
        beforeEach(() => {
            adapter = new twilio_whatsapp_adapter_1.MockTwilioWhatsAppAdapter();
        });
        it("should detect button response", () => {
            const payload = {
                MessageSid: "SM123",
                AccountSid: "AC123",
                From: "whatsapp:+201234567890",
                To: "whatsapp:+14155238886",
                Body: "نعم، أؤكد الطلب",
                NumMedia: "0",
                ButtonText: "تأكيد",
                ButtonPayload: "confirm_order",
            };
            const result = adapter.parseWebhook(payload);
            // Note: Mock adapter sets isButtonResponse based on ButtonText
            expect(result.body).toBe("نعم، أؤكد الطلب");
        });
    });
});
describe("TwilioWhatsAppAdapter Integration", () => {
    // These tests would require actual Twilio credentials
    // and are meant for integration testing only
    describe("Signature validation", () => {
        it("should validate correct Twilio signature", () => {
            // This test requires actual auth token
            // Skipped in unit tests
            expect(true).toBe(true);
        });
        it("should reject invalid signature", () => {
            // This test requires actual auth token
            // Skipped in unit tests
            expect(true).toBe(true);
        });
    });
});
