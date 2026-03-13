export declare const generateId: () => string;
export declare const generateOrderNumber: (merchantId: string) => string;
export declare const generateTrackingId: () => string;
export declare const generateOrderIdempotencyKey: (merchantId: string, conversationId: string, cartHash: string) => string;
export declare const hashCart: (cart: {
    items: unknown[];
    total: number;
}) => string;
export declare const maskPhone: (phone: string) => string;
export declare const maskAddress: (address: string) => string;
export declare const normalizePhone: (phone: string) => string;
export declare const isValidEgyptianPhone: (phone: string) => boolean;
export declare const getTodayDate: () => string;
export declare const getDateDaysAgo: (days: number) => Date;
export declare const delay: (ms: number) => Promise<void>;
export declare function withRetry<T>(fn: () => Promise<T>, options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
}): Promise<T>;
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T>;
export declare function safeJsonParse<T>(json: string, defaultValue: T): T;
export declare const truncate: (str: string, maxLength?: number) => string;
