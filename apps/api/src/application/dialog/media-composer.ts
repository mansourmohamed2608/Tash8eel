import { Pool } from "pg";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { OutboundMediaAttachment, MetaChannel } from "../adapters/channel.adapter.interface";

export interface MediaComposerInput {
  pool: Pool;
  merchantId: string;
  channel?: MetaChannel;
  customerMessage: string;
  replyText?: string;
  catalogItems: CatalogItem[];
}

interface ProductMediaRow {
  url: string;
  caption_ar: string | null;
  caption_en: string | null;
  fallback_text: string | null;
}

export class MediaComposer {
  static async compose(
    input: MediaComposerInput,
  ): Promise<OutboundMediaAttachment[]> {
    if (!this.isMediaRequest(input.customerMessage)) return [];

    const candidates = this.findMentionedItems(
      `${input.customerMessage} ${input.replyText || ""}`,
      input.catalogItems,
    );
    if (candidates.length === 0) return [];

    const channel = input.channel || "whatsapp";
    const result = await input.pool.query<ProductMediaRow>(
      `SELECT pm.url, pm.caption_ar, pm.caption_en, pm.fallback_text
       FROM product_media pm
       JOIN catalog_items ci ON ci.id = pm.catalog_item_id
       WHERE ci.merchant_id = $1
         AND pm.catalog_item_id = ANY($2::uuid[])
         AND pm.send_on IN ('on_request', 'always')
         AND COALESCE((pm.channel_flags ->> $3)::boolean, true) = true
       ORDER BY pm.display_order ASC, pm.created_at ASC
       LIMIT 3`,
      [input.merchantId, candidates.map((item) => item.id), channel],
    );

    return result.rows.map((row) => ({
      url: row.url,
      caption: row.caption_ar || row.caption_en || undefined,
      fallbackText:
        row.fallback_text ||
        row.caption_ar ||
        row.caption_en ||
        "الصورة مش متاحة للإرسال دلوقتي، أقدر أوصفهولك لو تحب.",
    }));
  }

  private static isMediaRequest(text: string): boolean {
    return /صورة|صور|ابعت.*(?:صورة|صور)|شكل(?:ه|ها)?|photo|image|pic/i.test(
      text || "",
    );
  }

  private static findMentionedItems(
    text: string,
    catalogItems: CatalogItem[],
  ): CatalogItem[] {
    const normalized = this.normalize(text);
    return catalogItems.filter((item) => {
      const candidates = [item.sku, item.nameAr, item.nameEn, item.name]
        .filter(Boolean)
        .map((value) => this.normalize(String(value)));
      return candidates.some(
        (candidate) => candidate.length >= 3 && normalized.includes(candidate),
      );
    });
  }

  private static normalize(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[اأإآ]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/[ة]/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
