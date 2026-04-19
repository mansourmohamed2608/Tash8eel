export function isHumanReadableProductName(value?: unknown): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (/^[A-Z0-9][A-Z0-9\-_]{2,}$/i.test(normalized)) return false;
  if (/^[a-z0-9][a-z0-9\-_]{2,}$/i.test(normalized) && !/\s/.test(normalized)) {
    return false;
  }
  return true;
}

export function pickHumanReadableProductName(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (!isHumanReadableProductName(text)) continue;
    return text;
  }

  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "منتج";
}

export function normalizeDisplayProductName(
  value?: unknown,
  fallback = "منتج",
): string {
  const picked = pickHumanReadableProductName(value);
  return String(picked || fallback).trim() || fallback;
}
