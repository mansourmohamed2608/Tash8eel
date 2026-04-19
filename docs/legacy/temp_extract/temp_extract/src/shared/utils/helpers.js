"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncate = exports.delay = exports.getDateDaysAgo = exports.getTodayDate = exports.isValidEgyptianPhone = exports.normalizePhone = exports.maskAddress = exports.maskPhone = exports.hashCart = exports.generateOrderIdempotencyKey = exports.generateTrackingId = exports.generateOrderNumber = exports.generateId = void 0;
exports.withRetry = withRetry;
exports.withTimeout = withTimeout;
exports.safeJsonParse = safeJsonParse;
const uuid_1 = require("uuid");
// Generate unique IDs
const generateId = () => (0, uuid_1.v4)();
exports.generateId = generateId;
// Generate order number
const generateOrderNumber = (merchantId) => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${merchantId.slice(-4).toUpperCase()}-${timestamp}-${random}`;
};
exports.generateOrderNumber = generateOrderNumber;
// Generate tracking ID
const generateTrackingId = () => {
    const prefix = "TRK";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${timestamp}${random}`;
};
exports.generateTrackingId = generateTrackingId;
// Generate idempotency key for orders
const generateOrderIdempotencyKey = (merchantId, conversationId, cartHash) => {
    return `order:${merchantId}:${conversationId}:${cartHash}`;
};
exports.generateOrderIdempotencyKey = generateOrderIdempotencyKey;
// Simple hash for cart (for idempotency)
const hashCart = (cart) => {
    const str = JSON.stringify(cart.items) + cart.total.toString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
};
exports.hashCart = hashCart;
// Mask PII for logging
const maskPhone = (phone) => {
    if (!phone || phone.length < 4)
        return "***";
    return phone.slice(0, 3) + "*".repeat(phone.length - 6) + phone.slice(-3);
};
exports.maskPhone = maskPhone;
const maskAddress = (address) => {
    if (!address || address.length < 10)
        return "***";
    return address.slice(0, 10) + "...";
};
exports.maskAddress = maskAddress;
// Parse phone number (Egyptian format)
const normalizePhone = (phone) => {
    // Remove spaces, dashes, and other characters
    let normalized = phone.replace(/[\s\-\(\)\.]/g, "");
    // Handle Egyptian formats
    if (normalized.startsWith("+2")) {
        normalized = normalized.slice(2);
    }
    else if (normalized.startsWith("002")) {
        normalized = normalized.slice(3);
    }
    else if (normalized.startsWith("2") && normalized.length === 12) {
        normalized = normalized.slice(1);
    }
    // Ensure starts with 0 for Egyptian numbers
    if (normalized.length === 10 && !normalized.startsWith("0")) {
        normalized = "0" + normalized;
    }
    return normalized;
};
exports.normalizePhone = normalizePhone;
// Validate Egyptian phone number
const isValidEgyptianPhone = (phone) => {
    const normalized = (0, exports.normalizePhone)(phone);
    // Egyptian mobile: 01[0125][0-9]{8}
    const mobileRegex = /^01[0125][0-9]{8}$/;
    // Egyptian landline: 0[2-9][0-9]{7,8}
    const landlineRegex = /^0[2-9][0-9]{7,8}$/;
    return mobileRegex.test(normalized) || landlineRegex.test(normalized);
};
exports.isValidEgyptianPhone = isValidEgyptianPhone;
// Date helpers
const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
};
exports.getTodayDate = getTodayDate;
const getDateDaysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
};
exports.getDateDaysAgo = getDateDaysAgo;
// Delay helper for retries
const delay = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
exports.delay = delay;
// Retry with exponential backoff
async function withRetry(fn, options = {}) {
    const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000, backoffMultiplier = 2, } = options;
    let lastError;
    let delayMs = initialDelayMs;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                await (0, exports.delay)(delayMs);
                delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
            }
        }
    }
    throw lastError;
}
// Timeout wrapper
async function withTimeout(promise, timeoutMs, errorMessage = "Operation timed out") {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
}
// Safe JSON parse
function safeJsonParse(json, defaultValue) {
    try {
        return JSON.parse(json);
    }
    catch {
        return defaultValue;
    }
}
// Truncate string for logs
const truncate = (str, maxLength = 100) => {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength) + "...";
};
exports.truncate = truncate;
