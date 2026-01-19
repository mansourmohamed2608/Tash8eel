import { v4 as uuidv4 } from 'uuid';

// Generate unique IDs
export const generateId = (): string => uuidv4();

// Generate order number
export const generateOrderNumber = (merchantId: string): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${merchantId.slice(-4).toUpperCase()}-${timestamp}-${random}`;
};

// Generate tracking ID
export const generateTrackingId = (): string => {
  const prefix = 'TRK';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// Generate idempotency key for orders
export const generateOrderIdempotencyKey = (
  merchantId: string,
  conversationId: string,
  cartHash: string,
): string => {
  return `order:${merchantId}:${conversationId}:${cartHash}`;
};

// Simple hash for cart (for idempotency)
export const hashCart = (cart: { items: unknown[]; total: number }): string => {
  const str = JSON.stringify(cart.items) + cart.total.toString();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Mask PII for logging
export const maskPhone = (phone: string): string => {
  if (!phone || phone.length < 4) return '***';
  return phone.slice(0, 3) + '*'.repeat(phone.length - 6) + phone.slice(-3);
};

export const maskAddress = (address: string): string => {
  if (!address || address.length < 10) return '***';
  return address.slice(0, 10) + '...';
};

// Parse phone number (Egyptian format)
export const normalizePhone = (phone: string): string => {
  // Remove spaces, dashes, and other characters
  let normalized = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Handle Egyptian formats
  if (normalized.startsWith('+2')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('002')) {
    normalized = normalized.slice(3);
  } else if (normalized.startsWith('2') && normalized.length === 12) {
    normalized = normalized.slice(1);
  }
  
  // Ensure starts with 0 for Egyptian numbers
  if (normalized.length === 10 && !normalized.startsWith('0')) {
    normalized = '0' + normalized;
  }
  
  return normalized;
};

// Validate Egyptian phone number
export const isValidEgyptianPhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone);
  // Egyptian mobile: 01[0125][0-9]{8}
  const mobileRegex = /^01[0125][0-9]{8}$/;
  // Egyptian landline: 0[2-9][0-9]{7,8}
  const landlineRegex = /^0[2-9][0-9]{7,8}$/;
  return mobileRegex.test(normalized) || landlineRegex.test(normalized);
};

// Date helpers
export const getTodayDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getDateDaysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

// Delay helper for retries
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Retry with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await delay(delayMs);
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}

// Timeout wrapper
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out',
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Safe JSON parse
export function safeJsonParse<T>(
  json: string,
  defaultValue: T,
): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// Truncate string for logs
export const truncate = (str: string, maxLength = 100): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
};
