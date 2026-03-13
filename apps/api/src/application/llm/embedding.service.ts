import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

/**
 * EmbeddingService
 * ─────────────────
 * Wraps OpenAI text-embedding-3-small to produce 1536-dim float vectors.
 *
 * Why text-embedding-3-small?
 *  - Same 1536 dimensions as ada-002 (fits existing schema column)
 *  - 5× cheaper than ada-002
 *  - Better quality on Arabic text
 *
 * Batch sizing: the API accepts up to 2048 inputs per request but that
 * would make the payload enormous; we chunk at 64 items.
 */
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const BATCH_SIZE = 64;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI;
  private readonly isTestMode: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY", "");
    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      (process.env.NODE_ENV === "test" && !apiKey.startsWith("sk-proj-"));
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Embed a single text string.
   * Returns a zero-vector in test mode so the rest of the pipeline still works.
   */
  async embed(text: string): Promise<number[]> {
    if (this.isTestMode) return new Array(EMBED_DIM).fill(0);

    const clean = this.clean(text);
    const res = await this.client.embeddings.create({
      model: EMBED_MODEL,
      input: clean,
      dimensions: EMBED_DIM,
    });
    return res.data[0].embedding;
  }

  /**
   * Embed many texts at once (batched).
   * Preserves order. Fills zeros in test mode.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.isTestMode) return texts.map(() => new Array(EMBED_DIM).fill(0));
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map((t) => this.clean(t));
      const res = await this.client.embeddings.create({
        model: EMBED_MODEL,
        input: batch,
        dimensions: EMBED_DIM,
      });
      res.data.forEach((d, j) => {
        results[i + j] = d.embedding;
      });
    }
    return results;
  }

  /**
   * Cosine similarity between two unit-normalised vectors.
   * pgvector uses <=> (cosine distance = 1 - similarity), so this is only
   * needed for in-process MMR re-ranking.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** Remove excessive whitespace and truncate to 8000 chars to stay within token limits. */
  private clean(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, 8000);
  }

  /** Build the text that represents a catalog item for embedding. */
  buildCatalogText(item: {
    nameAr?: string;
    nameEn?: string;
    descriptionAr?: string;
    descriptionEn?: string;
    category?: string;
    tags?: string[];
    variants?: Array<{ name: string; values: string[] }>;
  }): string {
    const parts: string[] = [];
    if (item.nameAr) parts.push(item.nameAr);
    if (item.nameEn) parts.push(item.nameEn);
    if (item.descriptionAr) parts.push(item.descriptionAr);
    if (item.descriptionEn) parts.push(item.descriptionEn);
    if (item.category) parts.push(item.category);
    if (item.tags?.length) parts.push(item.tags.join(" "));
    if (item.variants?.length) {
      for (const v of item.variants) {
        parts.push(`${v.name}: ${v.values.join(", ")}`);
      }
    }
    return parts.join(" | ");
  }
}
