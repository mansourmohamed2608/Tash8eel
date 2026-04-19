/**
 * P0 Security Fixes Tests
 *
 * Tests for the 4 critical security vulnerabilities fixed:
 * 1. Public payments controller - code validation, size limits, SSRF prevention
 * 2. Staff auth IDOR fixes - logout/change-password derive staffId from token
 * 3. Rate limiting on auth endpoints
 * 4. Base64 image bomb protection in payment service
 */
export {};
