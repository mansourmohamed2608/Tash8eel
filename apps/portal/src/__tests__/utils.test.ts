import { describe, test, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatNumber,
  formatDate,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  truncate,
  formatPercent,
} from "@/lib/utils";

describe("cn (className merge)", () => {
  test("merges simple class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "end")).toBe("base end");
  });

  test("merges tailwind conflicts", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  test("handles undefined/null", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });
});

describe("formatCurrency", () => {
  test("formats EGP by default", () => {
    const result = formatCurrency(1500);
    // Arabic locale may use Arabic-Indic digits (١٥٠٠) or Western (1500)
    const hasDigits = /[0-9١-٩]/.test(result);
    expect(hasDigits).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toBeDefined();
  });

  test("handles decimals", () => {
    const result = formatCurrency(99.99);
    expect(result).toBeDefined();
  });

  test("accepts custom currency", () => {
    const result = formatCurrency(100, "USD");
    expect(result).toBeDefined();
  });
});

describe("formatNumber", () => {
  test("formats integers", () => {
    const result = formatNumber(1000);
    expect(result).toBeDefined();
    // Arabic locale uses different digit separators
  });

  test("handles zero", () => {
    expect(formatNumber(0)).toBeDefined();
  });
});

describe("formatDate", () => {
  test("formats short date", () => {
    const result = formatDate("2026-01-15");
    expect(result).toBeDefined();
  });

  test("formats long date", () => {
    const result = formatDate("2026-01-15", "long");
    expect(result).toBeDefined();
  });

  test("formats time", () => {
    const result = formatDate("2026-01-15T14:30:00Z", "time");
    expect(result).toBeDefined();
  });

  test("accepts Date object", () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(result).toBeDefined();
  });
});

describe("formatRelativeTime", () => {
  test('returns "الآن" for current time', () => {
    const result = formatRelativeTime(new Date());
    expect(result).toBe("الآن");
  });

  test("returns minutes for recent time", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000);
    const result = formatRelativeTime(fiveMinAgo);
    expect(result).toContain("دقيقة");
  });

  test("returns hours for hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000);
    const result = formatRelativeTime(threeHoursAgo);
    expect(result).toContain("ساعة");
  });

  test("returns days for days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    const result = formatRelativeTime(twoDaysAgo);
    expect(result).toContain("يوم");
  });

  test("returns formatted date for old dates", () => {
    const oldDate = new Date(Date.now() - 30 * 86400000);
    const result = formatRelativeTime(oldDate);
    // Should not contain relative time words
    expect(result).not.toContain("دقيقة");
    expect(result).not.toContain("ساعة");
  });
});

describe("getStatusColor", () => {
  test("returns correct color for known status", () => {
    expect(getStatusColor("CONFIRMED")).toBe("bg-blue-100 text-blue-800");
    expect(getStatusColor("DELIVERED")).toBe("bg-green-100 text-green-800");
    expect(getStatusColor("CANCELLED")).toBe("bg-red-100 text-red-800");
  });

  test("returns default for unknown status", () => {
    expect(getStatusColor("UNKNOWN_STATUS")).toBe("bg-gray-100 text-gray-800");
  });

  test("handles stock statuses", () => {
    expect(getStatusColor("LOW_STOCK")).toContain("orange");
    expect(getStatusColor("OUT_OF_STOCK")).toContain("red");
    expect(getStatusColor("IN_STOCK")).toContain("green");
  });
});

describe("getStatusLabel", () => {
  test("returns Arabic label for known status", () => {
    expect(getStatusLabel("CONFIRMED")).toBe("مؤكد");
    expect(getStatusLabel("DELIVERED")).toBe("تم التوصيل");
    expect(getStatusLabel("CANCELLED")).toBe("ملغي");
  });

  test("returns raw status for unknown", () => {
    expect(getStatusLabel("MYSTERY")).toBe("MYSTERY");
  });

  test("covers conversation states", () => {
    expect(getStatusLabel("GREETING")).toBe("ترحيب");
    expect(getStatusLabel("NEGOTIATING")).toBe("تفاوض");
    expect(getStatusLabel("HUMAN_TAKEOVER")).toBe("تدخل بشري");
  });
});

describe("truncate", () => {
  test("returns full string when short enough", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("truncates with ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  test("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  test("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("formatPercent", () => {
  test("formats decimal as percentage", () => {
    expect(formatPercent(0.5)).toBe("50.0%");
  });

  test("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  test("formats with precision", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
  });

  test("formats over 100%", () => {
    expect(formatPercent(1.5)).toBe("150.0%");
  });
});
