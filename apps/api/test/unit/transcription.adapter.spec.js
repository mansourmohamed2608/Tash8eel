"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const transcription_adapter_1 = require("../../src/application/adapters/transcription.adapter");
describe("TranscriptionAdapters", () => {
    describe("MockTranscriptionAdapter", () => {
        let adapter;
        let configService;
        beforeEach(() => {
            configService = {
                get: jest.fn().mockReturnValue(""),
            };
            adapter = new transcription_adapter_1.MockTranscriptionAdapter(configService);
        });
        describe("transcribe", () => {
            it("should return transcription result for buffer input", async () => {
                const audioBuffer = Buffer.from("mock audio data");
                const result = await adapter.transcribe(audioBuffer);
                expect(result).toHaveProperty("text");
                expect(result).toHaveProperty("confidence");
                expect(result).toHaveProperty("duration");
                expect(result).toHaveProperty("language");
                expect(result.text.length).toBeGreaterThan(0);
            });
            it("should return transcription result for URL input", async () => {
                const audioUrl = "https://example.com/audio.ogg";
                const result = await adapter.transcribe(audioUrl);
                expect(result).toHaveProperty("text");
                expect(result.text.length).toBeGreaterThan(0);
            });
            it("should include segments in result", async () => {
                const audioBuffer = Buffer.alloc(32000); // ~2 seconds of audio
                const result = await adapter.transcribe(audioBuffer);
                expect(result.segments).toBeDefined();
                expect(result.segments.length).toBeGreaterThan(0);
                for (const segment of result.segments) {
                    expect(segment).toHaveProperty("start");
                    expect(segment).toHaveProperty("end");
                    expect(segment).toHaveProperty("text");
                    expect(segment).toHaveProperty("confidence");
                }
            });
            it("should respect language option", async () => {
                const audioBuffer = Buffer.from("mock audio");
                const result = await adapter.transcribe(audioBuffer, {
                    language: "en",
                });
                expect(result.language).toBe("en");
            });
            it("should default to Arabic language", async () => {
                const audioBuffer = Buffer.from("mock audio");
                const result = await adapter.transcribe(audioBuffer);
                expect(result.language).toBe("ar");
            });
            it("should have confidence between 0.85 and 0.95", async () => {
                const audioBuffer = Buffer.from("mock audio");
                const result = await adapter.transcribe(audioBuffer);
                expect(result.confidence).toBeGreaterThanOrEqual(0.85);
                expect(result.confidence).toBeLessThanOrEqual(0.95);
            });
        });
        describe("isSupported", () => {
            it("should support common audio formats", () => {
                expect(adapter.isSupported("audio/ogg")).toBe(true);
                expect(adapter.isSupported("audio/opus")).toBe(true);
                expect(adapter.isSupported("audio/mpeg")).toBe(true);
                expect(adapter.isSupported("audio/mp3")).toBe(true);
                expect(adapter.isSupported("audio/wav")).toBe(true);
                expect(adapter.isSupported("audio/webm")).toBe(true);
            });
            it("should not support unsupported formats", () => {
                expect(adapter.isSupported("video/mp4")).toBe(false);
                expect(adapter.isSupported("image/png")).toBe(false);
                expect(adapter.isSupported("text/plain")).toBe(false);
            });
            it("should be case insensitive", () => {
                expect(adapter.isSupported("AUDIO/OGG")).toBe(true);
                expect(adapter.isSupported("Audio/Wav")).toBe(true);
            });
        });
    });
    describe("WhisperTranscriptionAdapter", () => {
        let adapter;
        let configService;
        beforeEach(() => {
            configService = {
                get: jest.fn().mockImplementation((key, defaultValue) => {
                    if (key === "OPENAI_API_KEY")
                        return "test-api-key";
                    return defaultValue;
                }),
            };
            adapter = new transcription_adapter_1.WhisperTranscriptionAdapter(configService);
        });
        describe("isSupported", () => {
            it("should support Whisper-compatible formats", () => {
                expect(adapter.isSupported("audio/ogg")).toBe(true);
                expect(adapter.isSupported("audio/opus")).toBe(true);
                expect(adapter.isSupported("audio/mpeg")).toBe(true);
                expect(adapter.isSupported("audio/wav")).toBe(true);
                expect(adapter.isSupported("audio/flac")).toBe(true);
            });
        });
        describe("transcribe", () => {
            it("should throw error when API key is not configured", async () => {
                const noKeyConfigService = {
                    get: jest.fn().mockReturnValue(""),
                };
                const noKeyAdapter = new transcription_adapter_1.WhisperTranscriptionAdapter(noKeyConfigService);
                const audioBuffer = Buffer.from("mock audio");
                await expect(noKeyAdapter.transcribe(audioBuffer)).rejects.toThrow("OpenAI API key not configured");
            });
            // Note: Real API calls would need mocking in integration tests
        });
    });
});
describe("TranscriptionResult", () => {
    it("should have required properties", () => {
        const result = {
            text: "مرحبا",
            confidence: 0.9,
            duration: 2.5,
            language: "ar",
        };
        expect(result.text).toBe("مرحبا");
        expect(result.confidence).toBe(0.9);
        expect(result.duration).toBe(2.5);
        expect(result.language).toBe("ar");
    });
    it("should support optional segments", () => {
        const result = {
            text: "مرحبا كيف حالك",
            confidence: 0.9,
            duration: 3.0,
            language: "ar",
            segments: [
                { start: 0, end: 1.5, text: "مرحبا", confidence: 0.95 },
                { start: 1.5, end: 3.0, text: "كيف حالك", confidence: 0.85 },
            ],
        };
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].text).toBe("مرحبا");
    });
});
