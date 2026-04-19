import { v4 as uuidv4 } from "uuid";

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;
  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Operation timed out",
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Normalize Arabic text (remove diacritics, normalize characters)
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F]/g, "") // Remove tashkeel (diacritics)
    .replace(/[إأآا]/g, "ا") // Normalize alef variants
    .replace(/ى/g, "ي") // Normalize ya
    .replace(/ة/g, "ه") // Normalize ta marbuta
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Extract phone number from text (Egyptian format)
 */
export function extractPhoneNumber(text: string): string | null {
  // Match Egyptian phone patterns: 01XXXXXXXXX, +201XXXXXXXXX, 201XXXXXXXXX
  const patterns = [/(?:\+?2)?01[0125][0-9]{8}/, /01[0125][0-9]{8}/];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let phone = match[0].replace(/\D/g, "");
      // Ensure it starts with 01
      if (phone.startsWith("2")) {
        phone = phone.substring(1);
      }
      if (phone.length === 11 && phone.startsWith("01")) {
        return phone;
      }
    }
  }
  return null;
}

/**
 * Hash a string (simple hash for API keys)
 */
export async function hashString(str: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Generate a secure random API key
 */
export async function generateApiKey(): Promise<string> {
  const crypto = await import("crypto");
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Truncate text to a maximum length
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix: string = "...",
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Omit keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Pick keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Format currency in Egyptian Pounds
 */
export function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} ج.م`;
}

/**
 * Parse Google Maps URL to extract coordinates
 */
export function parseGoogleMapsUrl(
  url: string,
): { lat: number; lng: number } | null {
  try {
    // Pattern 1: @lat,lng
    const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
    const atMatch = url.match(atPattern);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }

    // Pattern 2: ?q=lat,lng
    const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
    const qMatch = url.match(qPattern);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }

    // Pattern 3: /place/lat,lng
    const placePattern = /\/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/;
    const placeMatch = url.match(placePattern);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a Google Maps URL
 */
export function isGoogleMapsUrl(url: string): boolean {
  return /(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(
    url,
  );
}
