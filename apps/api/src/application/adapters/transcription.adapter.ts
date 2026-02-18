import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const TRANSCRIPTION_ADAPTER = Symbol("TRANSCRIPTION_ADAPTER");

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number; // seconds
  language: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
}

export interface TranscriptionOptions {
  language?: string; // ISO 639-1 code, e.g., 'ar', 'en'
  model?: string;
  prompt?: string; // Optional context hint
}

export interface ITranscriptionAdapter {
  transcribe(
    audioData: Buffer | string, // Buffer or URL
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;

  isSupported(mimeType: string): boolean;
}

/**
 * Mock transcription adapter for development/testing
 * Returns predefined transcriptions based on audio duration
 */
@Injectable()
export class MockTranscriptionAdapter implements ITranscriptionAdapter {
  private readonly logger = new Logger(MockTranscriptionAdapter.name);
  private readonly mockResponses: Map<string, string>;

  constructor(private readonly configService: ConfigService) {
    // Pre-defined mock responses in Arabic
    this.mockResponses = new Map([
      ["greeting", "مرحبا، عايز أطلب"],
      ["order", "عايز قميص أزرق مقاس M وبنطلون أسود مقاس L"],
      [
        "address",
        "العنوان هو شارع التحرير، عمارة ٥، الدور الثالث، شقة ١٢، جنب بنك مصر",
      ],
      [
        "phone",
        "رقم التليفون صفر عشرة مية واحد اتنين تلاتة اربعة خمسة ستة سبعة",
      ],
      ["confirmation", "أيوه تمام، موافق على الطلب"],
      ["cancel", "لا مش عايز، الغي الطلب"],
      ["question", "كام سعر القميص ده؟"],
      ["complaint", "الطلب اتأخر كتير، فين الأوردر؟"],
    ]);
  }

  async transcribe(
    audioData: Buffer | string,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    this.logger.log({
      msg: "Mock transcription requested",
      isUrl: typeof audioData === "string",
      language: options?.language,
    });

    // Simulate processing delay
    await this.simulateDelay(500, 2000);

    // Determine mock response based on audio "characteristics"
    const duration = this.estimateDuration(audioData);
    const text = this.selectMockResponse(duration);

    return {
      text,
      confidence: 0.85 + Math.random() * 0.1, // 0.85 - 0.95
      duration,
      language: options?.language || "ar",
      segments: this.generateMockSegments(text, duration),
    };
  }

  isSupported(mimeType: string): boolean {
    const supportedTypes = [
      "audio/ogg",
      "audio/opus",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/webm",
      "audio/m4a",
      "audio/aac",
    ];
    return supportedTypes.includes(mimeType.toLowerCase());
  }

  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private estimateDuration(audioData: Buffer | string): number {
    if (typeof audioData === "string") {
      // URL - assume random duration
      return Math.floor(Math.random() * 10) + 2;
    }
    // Buffer - estimate based on size (very rough estimate)
    // Assuming ~16KB per second for compressed audio
    return Math.max(1, Math.floor(audioData.length / 16000));
  }

  private selectMockResponse(duration: number): string {
    const keys = Array.from(this.mockResponses.keys());

    // Short messages for short durations
    if (duration <= 2) {
      return this.mockResponses.get("greeting") || "مرحبا";
    }

    // Longer messages for longer durations
    if (duration >= 8) {
      return (
        this.mockResponses.get("address") || this.mockResponses.get("order")!
      );
    }

    // Random selection for medium durations
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return this.mockResponses.get(randomKey) || "مرحبا";
  }

  private generateMockSegments(
    text: string,
    duration: number,
  ): TranscriptionResult["segments"] {
    const words = text.split(" ");
    const segmentCount = Math.min(words.length, Math.ceil(duration / 2));
    const segments: TranscriptionResult["segments"] = [];

    const wordsPerSegment = Math.ceil(words.length / segmentCount);
    const timePerSegment = duration / segmentCount;

    for (let i = 0; i < segmentCount; i++) {
      const startWord = i * wordsPerSegment;
      const endWord = Math.min(startWord + wordsPerSegment, words.length);
      const segmentWords = words.slice(startWord, endWord);

      segments.push({
        start: i * timePerSegment,
        end: (i + 1) * timePerSegment,
        text: segmentWords.join(" "),
        confidence: 0.8 + Math.random() * 0.15,
      });
    }

    return segments;
  }
}

/**
 * OpenAI Whisper transcription adapter
 * Uses OpenAI's Whisper API for production transcription
 */
@Injectable()
export class WhisperTranscriptionAdapter implements ITranscriptionAdapter {
  private readonly logger = new Logger(WhisperTranscriptionAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.openai.com/v1/audio/transcriptions";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("OPENAI_API_KEY", "");
  }

  async transcribe(
    audioData: Buffer | string,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const startTime = Date.now();

    try {
      // If URL, fetch the audio first
      let audioBuffer: Buffer;
      if (typeof audioData === "string") {
        audioBuffer = await this.fetchAudio(audioData);
      } else {
        audioBuffer = audioData;
      }

      // Prepare form data
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: "audio/ogg" });
      formData.append("file", blob, "audio.ogg");
      formData.append("model", options?.model || "whisper-1");
      formData.append("language", options?.language || "ar");
      formData.append("response_format", "verbose_json");

      if (options?.prompt) {
        formData.append("prompt", options.prompt);
      }

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Whisper API error: ${response.status} - ${error}`);
      }

      const result = (await response.json()) as {
        text: string;
        duration?: number;
        language?: string;
        segments?: Array<{
          start: number;
          end: number;
          text: string;
          avg_logprob?: number;
        }>;
      };
      const duration = (Date.now() - startTime) / 1000;

      this.logger.log({
        msg: "Whisper transcription completed",
        duration: result.duration,
        processingTime: duration,
        language: result.language,
      });

      return {
        text: result.text,
        confidence: 0.95, // Whisper doesn't return confidence
        duration: result.duration || 0,
        language: result.language || options?.language || "ar",
        segments: result.segments?.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          confidence: s.avg_logprob ? Math.exp(s.avg_logprob) : 0.9,
        })),
      };
    } catch (error) {
      this.logger.error({
        msg: "Whisper transcription failed",
        error: (error as Error).message,
      });
      throw error;
    }
  }

  isSupported(mimeType: string): boolean {
    // Whisper supports various formats
    const supportedTypes = [
      "audio/ogg",
      "audio/opus",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/webm",
      "audio/m4a",
      "audio/flac",
    ];
    return supportedTypes.includes(mimeType.toLowerCase());
  }

  private async fetchAudio(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

/**
 * Factory to get appropriate transcription adapter
 */
@Injectable()
export class TranscriptionAdapterFactory {
  constructor(
    private readonly mockAdapter: MockTranscriptionAdapter,
    private readonly whisperAdapter: WhisperTranscriptionAdapter,
    private readonly configService: ConfigService,
  ) {}

  getAdapter(): ITranscriptionAdapter {
    const useMock =
      this.configService.get<string>("TRANSCRIPTION_MOCK", "false") === "true";

    if (useMock) {
      return this.mockAdapter;
    }

    return this.whisperAdapter;
  }
}
