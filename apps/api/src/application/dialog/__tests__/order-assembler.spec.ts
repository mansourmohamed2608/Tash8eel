/**
 * OrderAssembler unit tests — pure, no NestJS, no DB, no merchant names.
 * All catalog items use generic placeholder names to prove no hardcoding.
 */

import { OrderAssembler } from "../order-assembler";
import { CatalogItem } from "../../../domain/entities/catalog.entity";

function makeCatalogItem(
  id: string,
  nameAr: string,
  nameEn?: string,
  sku?: string,
): CatalogItem {
  return {
    id,
    merchantId: "test-merchant",
    nameAr,
    nameEn,
    sku,
    basePrice: 100,
    variants: [],
    options: [],
    tags: [],
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const CATALOG: CatalogItem[] = [
  makeCatalogItem("id-alpha", "الخيار ألفا", "Option Alpha", "SKU-ALPHA"),
  makeCatalogItem("id-beta", "الخيار بيتا", "Option Beta", "SKU-BETA"),
  makeCatalogItem("id-gamma", "الخيار جاما", "Option Gamma", "SKU-GAMMA"),
];

describe("OrderAssembler.assemble — exact matches", () => {
  it("matches Arabic name exactly", () => {
    const result = OrderAssembler.assemble(["الخيار ألفا"], CATALOG);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-alpha");
    expect(result[0].sourceText).toBe("الخيار ألفا");
  });

  it("matches English name (case-insensitive)", () => {
    const result = OrderAssembler.assemble(["Option Beta"], CATALOG);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-beta");
  });

  it("matches SKU exactly", () => {
    const result = OrderAssembler.assemble(["SKU-GAMMA"], CATALOG);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-gamma");
  });
});

describe("OrderAssembler.assemble — multiple options", () => {
  it("resolves both options when customer selects all (الاتنين)", () => {
    const result = OrderAssembler.assemble(
      ["الخيار ألفا", "الخيار بيتا"],
      CATALOG,
    );
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.catalogItemId);
    expect(ids).toContain("id-alpha");
    expect(ids).toContain("id-beta");
  });

  it("does not assign the same catalog item to two inputs", () => {
    // Both inputs are vague — should not duplicate
    const result = OrderAssembler.assemble(["ألفا", "ألفا"], CATALOG);
    // Second occurrence must not reuse id-alpha
    const usedIds = result.map((r) => r.catalogItemId);
    const unique = new Set(usedIds);
    expect(unique.size).toBe(usedIds.length);
  });

  it("resolves three options from a three-item catalog", () => {
    const result = OrderAssembler.assemble(
      ["الخيار ألفا", "الخيار بيتا", "الخيار جاما"],
      CATALOG,
    );
    expect(result).toHaveLength(3);
  });
});

describe("OrderAssembler.assemble — partial / token overlap", () => {
  it("matches on partial Arabic token (normalized)", () => {
    const result = OrderAssembler.assemble(["ألفا"], CATALOG);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-alpha");
  });

  it("matches despite alef normalization (أ → ا)", () => {
    // "ألفا" with different alef variant
    const result = OrderAssembler.assemble(["الفا"], CATALOG);
    // "الفا" normalizes to "الفا", nameAr "الخيار ألفا" normalizes to "الخيار الفا"
    // token "الفا" is in nameAr tokens → overlap >= 1 → score 10
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-alpha");
  });
});

describe("OrderAssembler.assemble — no match", () => {
  it("returns empty array when no catalog item matches", () => {
    const result = OrderAssembler.assemble(["شيء غير موجود أبداً"], CATALOG);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(OrderAssembler.assemble([], CATALOG)).toHaveLength(0);
  });

  it("returns empty array for empty catalog", () => {
    const result = OrderAssembler.assemble(["الخيار ألفا"], []);
    expect(result).toHaveLength(0);
  });

  it("skips empty strings in resolvedTexts", () => {
    const result = OrderAssembler.assemble(["", "الخيار بيتا", ""], CATALOG);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe("id-beta");
  });
});

describe("OrderAssembler — no hardcoded names", () => {
  const FORBIDDEN = [
    "عطر", "فستان", "قميص", "بيتزا", "مطعم",
    "apparel", "perfume", "fashion", "demo", "Demo",
  ];

  it("source code contains no hardcoded product/merchant names", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../order-assembler.ts"),
      "utf8",
    );
    for (const term of FORBIDDEN) {
      expect(src).not.toContain(term);
    }
  });
});
