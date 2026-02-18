import {
  generateId,
  getTodayDate,
  getTimestamp,
  sleep,
  withRetry,
  withTimeout,
  normalizeArabic,
  extractPhoneNumber,
  truncate,
  deepClone,
  isEmpty,
  omit,
  pick,
  formatCurrency,
  parseGoogleMapsUrl,
  isGoogleMapsUrl,
} from "./index";

describe("Utils", () => {
  describe("generateId", () => {
    it("should return a valid UUID v4", () => {
      const id = generateId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should return unique values", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("getTodayDate", () => {
    it("should return date in YYYY-MM-DD format", () => {
      const date = getTodayDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("getTimestamp", () => {
    it("should return ISO timestamp", () => {
      const ts = getTimestamp();
      expect(new Date(ts).toISOString()).toBe(ts);
    });
  });

  describe("sleep", () => {
    it("should delay for specified ms", async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("withRetry", () => {
    it("should succeed on first attempt if no error", async () => {
      const fn = jest.fn().mockResolvedValue("ok");
      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValue("ok");
      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("always fail"));
      await expect(
        withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }),
      ).rejects.toThrow("always fail");
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe("withTimeout", () => {
    it("should resolve if within timeout", async () => {
      const result = await withTimeout(Promise.resolve("fast"), 1000);
      expect(result).toBe("fast");
    });

    it("should reject if timeout exceeded", async () => {
      const slow = new Promise((resolve) => setTimeout(resolve, 5000));
      await expect(withTimeout(slow, 50)).rejects.toThrow(
        "Operation timed out",
      );
    });

    it("should use custom error message", async () => {
      const slow = new Promise((resolve) => setTimeout(resolve, 5000));
      await expect(withTimeout(slow, 50, "Too slow!")).rejects.toThrow(
        "Too slow!",
      );
    });
  });

  describe("normalizeArabic", () => {
    it("should remove tashkeel", () => {
      expect(normalizeArabic("مَرْحَبًا")).toBe("مرحبا");
    });

    it("should normalize alef variants", () => {
      expect(normalizeArabic("إبراهيم")).toBe("ابراهيم");
      expect(normalizeArabic("أحمد")).toBe("احمد");
      expect(normalizeArabic("آمال")).toBe("امال");
    });

    it("should normalize ya and ta marbuta", () => {
      expect(normalizeArabic("مدرسة")).toBe("مدرسه");
      expect(normalizeArabic("على")).toBe("علي");
    });

    it("should normalize whitespace", () => {
      expect(normalizeArabic("  مرحبا   بك  ")).toBe("مرحبا بك");
    });
  });

  describe("extractPhoneNumber", () => {
    it("should extract Egyptian phone number (01X)", () => {
      expect(extractPhoneNumber("رقمي 01012345678")).toBe("01012345678");
    });

    it("should extract phone with +20 prefix", () => {
      expect(extractPhoneNumber("+201012345678")).toBe("01012345678");
    });

    it("should extract phone with 20 prefix", () => {
      expect(extractPhoneNumber("201012345678")).toBe("01012345678");
    });

    it("should return null for non-Egyptian numbers", () => {
      expect(extractPhoneNumber("no phone here")).toBeNull();
      expect(extractPhoneNumber("0991234567")).toBeNull(); // not 01X
    });

    it("should handle 015 numbers", () => {
      expect(extractPhoneNumber("01512345678")).toBe("01512345678");
    });
  });

  describe("truncate", () => {
    it("should not truncate short text", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate long text with ellipsis", () => {
      expect(truncate("hello world this is long", 10)).toBe("hello w...");
    });

    it("should use custom suffix", () => {
      expect(truncate("hello world", 8, "…")).toBe("hello w…");
    });
  });

  describe("deepClone", () => {
    it("should deep clone objects", () => {
      const obj = { a: 1, b: { c: [1, 2, 3] } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
      cloned.b.c.push(4);
      expect(obj.b.c.length).toBe(3);
    });
  });

  describe("isEmpty", () => {
    it("should return true for empty objects", () => {
      expect(isEmpty({})).toBe(true);
    });

    it("should return false for non-empty objects", () => {
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });

  describe("omit", () => {
    it("should omit specified keys", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
    });

    it("should handle omitting non-existent keys", () => {
      const obj = { a: 1 };
      expect(omit(obj, ["b" as any])).toEqual({ a: 1 });
    });
  });

  describe("pick", () => {
    it("should pick specified keys", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
    });

    it("should ignore missing keys", () => {
      const obj = { a: 1 };
      expect(pick(obj, ["a", "b" as any])).toEqual({ a: 1 });
    });
  });

  describe("formatCurrency", () => {
    it("should format in EGP", () => {
      expect(formatCurrency(299)).toBe("299.00 ج.م");
      expect(formatCurrency(1299.5)).toBe("1299.50 ج.م");
      expect(formatCurrency(0)).toBe("0.00 ج.م");
    });
  });

  describe("parseGoogleMapsUrl", () => {
    it("should parse @lat,lng format", () => {
      const result = parseGoogleMapsUrl(
        "https://www.google.com/maps/@30.0444,31.2357,15z",
      );
      expect(result).toEqual({ lat: 30.0444, lng: 31.2357 });
    });

    it("should parse ?q=lat,lng format", () => {
      const result = parseGoogleMapsUrl(
        "https://www.google.com/maps?q=30.0444,31.2357",
      );
      expect(result).toEqual({ lat: 30.0444, lng: 31.2357 });
    });

    it("should parse /place/lat,lng format", () => {
      const result = parseGoogleMapsUrl(
        "https://www.google.com/maps/place/30.0444,31.2357",
      );
      expect(result).toEqual({ lat: 30.0444, lng: 31.2357 });
    });

    it("should return null for non-maps URLs", () => {
      expect(parseGoogleMapsUrl("https://google.com")).toBeNull();
    });
  });

  describe("isGoogleMapsUrl", () => {
    it("should detect Google Maps URLs", () => {
      expect(isGoogleMapsUrl("https://www.google.com/maps/@30,31")).toBe(true);
      expect(isGoogleMapsUrl("https://maps.google.com/test")).toBe(true);
      expect(isGoogleMapsUrl("https://goo.gl/maps/abc")).toBe(true);
      expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc")).toBe(true);
    });

    it("should reject non-maps URLs", () => {
      expect(isGoogleMapsUrl("https://google.com")).toBe(false);
      expect(isGoogleMapsUrl("https://example.com")).toBe(false);
    });
  });
});
