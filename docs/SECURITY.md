# Operations Agent - Security

## Overview

This document outlines security measures implemented in the Operations Agent.

## Authentication

### Merchant API Key

- Each merchant has a unique API key (format: `mk_<random>`)
- API key is passed in requests for merchant identification
- Keys are stored hashed in database (future enhancement)

### Admin API Key

- Required for admin endpoints (`/v1/admin/*`)
- Passed in `x-admin-api-key` header
- Validated by `AdminApiKeyGuard`
- Set via `ADMIN_API_KEY` environment variable

```typescript
@UseGuards(AdminApiKeyGuard)
@Controller("v1/admin")
export class AdminController {}
```

## Multi-Tenancy Isolation

### Database Level

- All queries include `merchant_id` in WHERE clause
- Repository interfaces enforce tenant isolation:

```typescript
interface IOrderRepository {
  findById(id: string, merchantId: string): Promise<Order | null>;
  // Never expose unscoped queries
}
```

### API Level

- Merchant ID required in all business endpoints
- No cross-tenant data access possible through API

## Input Validation

### Request Validation

- NestJS `ValidationPipe` with strict settings
- Whitelist mode: unknown properties stripped
- Transform mode: automatic type conversion

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

### Schema Validation

- Zod schemas for all critical data
- LLM responses validated before use
- Database inputs sanitized

## Security Headers

Using Helmet.js for standard security headers:

```typescript
app.use(helmet());
```

Headers set:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (when HTTPS)
- `Content-Security-Policy` (customizable)

## CORS Configuration

Controlled CORS for API access:

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-correlation-id",
    "x-admin-api-key",
  ],
});
```

## Sensitive Data Handling

### PII Masking in Logs

Phone numbers and other PII are masked:

```typescript
function maskPii(data: string): string {
  // Phone: 01234567890 -> 012****890
  return data.replace(/(\d{3})\d{4}(\d{3})/g, "$1****$2");
}
```

### No Secrets in Logs

- API keys never logged
- OpenAI responses logged without sensitive content
- Error messages sanitized

## API Key Management

### OpenAI API Key

- Stored in environment variable `OPENAI_API_KEY`
- Never exposed in responses
- Rate limiting applied

### Database Credentials

- Connection string in environment
- Pool connections with SSL (production)
- No credentials in code

## Rate Limiting (Recommended)

Add rate limiting for production:

```typescript
import { ThrottlerModule } from '@nestjs/throttler';

ThrottlerModule.forRoot({
  ttl: 60,
  limit: 100, // 100 requests per minute
}),
```

## SQL Injection Prevention

Using parameterized queries:

```typescript
// SAFE - parameterized
await pool.query("SELECT * FROM orders WHERE id = $1 AND merchant_id = $2", [
  orderId,
  merchantId,
]);

// NEVER do this
await pool.query(`SELECT * FROM orders WHERE id = '${orderId}'`);
```

## Error Handling

### Exception Filter

Sanitizes error responses:

```typescript
@Catch()
export class AllExceptionsFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Don't expose internal errors
    const message = isProd ? "Internal error" : exception.message;
    // Log full error internally
  }
}
```

### No Stack Traces in Production

- Stack traces only in development mode
- Generic error messages to clients

## Secrets Management

Recommended for production:

- Use Azure Key Vault / AWS Secrets Manager
- Never commit `.env` files
- Rotate API keys regularly

## Security Checklist

- [x] Input validation on all endpoints
- [x] Multi-tenant data isolation
- [x] Security headers (Helmet)
- [x] CORS configuration
- [x] PII masking in logs
- [x] Parameterized SQL queries
- [x] Admin endpoint protection
- [ ] Rate limiting (add for production)
- [ ] API key hashing in DB
- [ ] Request signing for webhooks
- [ ] IP allowlisting for admin
- [ ] Audit logging

## Reporting Security Issues

Contact: [security@example.com]

Do not disclose security issues publicly before they are fixed.
