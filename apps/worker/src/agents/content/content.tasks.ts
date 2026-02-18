/**
 * Content Agent Task Definitions (Stub)
 */

export interface GenerateDescriptionInput {
  productId: string;
  productName: string;
  category: string;
  attributes?: Record<string, string>;
  targetLanguage?: string;
}

export interface TranslateContentInput {
  content: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface EnrichCatalogInput {
  merchantId: string;
  catalogItemId: string;
  enrichmentTypes: ("description" | "tags" | "seo")[];
}
