# Pilot Runbook

**Version:** 1.0  
**Last Updated:** February 2, 2026  
**Status:** Ready for Pilot

---

## 📋 Table of Contents

1. [Pre-Pilot Checklist](#pre-pilot-checklist)
2. [Environment Setup](#environment-setup)
3. [Twilio Sandbox Testing](#twilio-sandbox-testing)
4. [KPI Dashboard Setup](#kpi-dashboard-setup)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Common Failure Recovery](#common-failure-recovery)
7. [Rollback Procedures](#rollback-procedures)
8. [Support Escalation](#support-escalation)

---

## Pre-Pilot Checklist

### Infrastructure ✅

- [ ] PostgreSQL (Neon) database provisioned and migrated
- [ ] Redis instance running for caching/sessions
- [ ] Environment variables configured (see `.env.example`)
- [ ] SSL certificates valid and installed
- [ ] DNS configured for production domain
- [ ] CDN configured for static assets

### Third-Party Services ✅

- [ ] Twilio account verified (WhatsApp Business API)
- [ ] Twilio phone number provisioned
- [ ] OpenAI API key configured with billing
- [ ] Stripe/Payment gateway configured (if PAYMENTS enabled)
- [ ] SendGrid/Email service configured

### Security ✅

- [ ] All hardcoded credentials removed (see `HARDCODED_VALUES_REPORT.md`)
- [ ] Neon database password rotated
- [ ] Admin API keys regenerated
- [ ] Rate limiting configured
- [ ] CORS origins restricted to production domains
- [ ] Security headers enabled (CSP, HSTS, etc.)

### Testing ✅

- [ ] Unit tests passing (`npm test --workspace=apps/api`)
- [ ] E2E tests passing (`npm run test:e2e --workspace=apps/api`)
- [ ] Security audit clean (`npm audit --audit-level=high`)
- [ ] Build successful (`npm run build`)

---

## Environment Setup

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Redis
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true

# Authentication
NEXTAUTH_SECRET=<generate-strong-secret>
ADMIN_API_KEY=<generate-strong-key>

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=<your-auth-token>
TWILIO_PHONE_NUMBER=+14155238886  # Sandbox number
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# Production
NODE_ENV=production
API_URL=https://api.yourapp.com
PORTAL_URL=https://portal.yourapp.com
```

### Deployment Commands

```bash
# Install dependencies
npm ci

# Run database migrations
npm run migration:run --workspace=apps/api

# Build all packages
npm run build

# Start production servers
npm run start:prod --workspace=apps/api
npm run start --workspace=apps/portal

# Or with PM2
pm2 start ecosystem.config.js
```

---

## Twilio Sandbox Testing

### Test Script: Complete Flow

Run these tests before onboarding real merchants:

#### 1. Voice Note Test

```bash
# Send a voice message to the WhatsApp number
# Expected: Transcription returned within 5 seconds

curl -X POST https://api.yourapp.com/webhook/twilio \
  -H "Content-Type: application/json" \
  -d '{
    "From": "whatsapp:+201234567890",
    "To": "whatsapp:+14155238886",
    "MediaContentType0": "audio/ogg",
    "MediaUrl0": "https://example.com/test-voice.ogg",
    "NumMedia": "1"
  }'

# Verify in logs:
# ✅ Voice transcription completed
# ✅ Response sent to customer
```

#### 2. Location Test

```bash
# Send a location message
# Expected: Location stored and acknowledged

curl -X POST https://api.yourapp.com/webhook/twilio \
  -H "Content-Type: application/json" \
  -d '{
    "From": "whatsapp:+201234567890",
    "To": "whatsapp:+14155238886",
    "Latitude": "30.0444",
    "Longitude": "31.2357",
    "LocationLabel": "Cairo, Egypt"
  }'

# Verify:
# ✅ Location stored in conversation context
# ✅ Delivery confirmation sent
```

#### 3. Image/Vision OCR Test

```bash
# Send an image (receipt or product photo)
# Expected: Image analyzed and response generated

curl -X POST https://api.yourapp.com/webhook/twilio \
  -H "Content-Type: application/json" \
  -d '{
    "From": "whatsapp:+201234567890",
    "To": "whatsapp:+14155238886",
    "MediaContentType0": "image/jpeg",
    "MediaUrl0": "https://example.com/test-receipt.jpg",
    "NumMedia": "1"
  }'

# Verify:
# ✅ Vision OCR processed image
# ✅ Extracted text/data logged
# ✅ Appropriate response sent
```

#### 4. Payment Proof Test

```bash
# Send a payment screenshot
# Expected: Payment detected and marked for review

curl -X POST https://api.yourapp.com/webhook/twilio \
  -H "Content-Type: application/json" \
  -d '{
    "From": "whatsapp:+201234567890",
    "To": "whatsapp:+14155238886",
    "MediaContentType0": "image/png",
    "MediaUrl0": "https://example.com/payment-screenshot.png",
    "NumMedia": "1",
    "Body": "دفعت الطلب رقم 123"
  }'

# Verify:
# ✅ Payment proof detected
# ✅ Order linked (if order ID mentioned)
# ✅ Merchant notified
```

### Manual Testing via WhatsApp

1. Save Twilio sandbox number: **+1 415 523 8886**
2. Send join code: `join <your-sandbox-code>`
3. Test scenarios:
   - Text: "السلام عليكم" → Bot should respond
   - Voice: Record and send → Transcription + response
   - Image: Send product photo → Vision analysis
   - Location: Share location → Acknowledgment

---

## KPI Dashboard Setup

### Expected Metrics

The KPI Dashboard (`/merchant/kpis`) should display:

| Metric                | Source                         | Refresh   |
| --------------------- | ------------------------------ | --------- |
| Total Revenue         | orders.total_price             | Real-time |
| Orders Today          | orders.created_at              | Real-time |
| Avg Order Value       | orders.total_price / count     | Hourly    |
| Response Time         | conversations.response_time_ms | Real-time |
| Customer Satisfaction | feedback.rating                | Daily     |
| Inventory Turnover    | inventory_movements            | Weekly    |

### Verify KPI Calculation

```bash
# Test KPI endpoint
curl -X GET https://api.yourapp.com/api/v1/kpis \
  -H "X-API-Key: <merchant-api-key>"

# Expected response:
{
  "success": true,
  "kpis": {
    "totalRevenue": 15000,
    "ordersToday": 12,
    "avgOrderValue": 125.50,
    "avgResponseTime": 2.3,
    "satisfactionScore": 4.7
  }
}
```

### Dashboard Access

- **Pro Plan**: Full KPI dashboard with all metrics
- **Growth Plan**: Basic metrics (orders, revenue)
- **Starter Plan**: Limited (upgrade prompt shown)

---

## Monitoring & Alerts

### Health Checks

```bash
# API Health
curl https://api.yourapp.com/health

# Expected:
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "uptime": "3d 14h 22m"
}
```

### Critical Alerts (Configure in your monitoring tool)

| Alert                | Threshold     | Action       |
| -------------------- | ------------- | ------------ |
| API Error Rate       | > 5% in 5 min | Page on-call |
| Response Time        | > 3s p95      | Investigate  |
| Database Connections | > 80% pool    | Scale up     |
| Queue Backlog        | > 100 jobs    | Check worker |
| Payment Failures     | > 3 in 1 hour | Escalate     |

### Log Locations

```bash
# API Logs
tail -f /var/log/tash8eel/api.log

# Worker Logs
tail -f /var/log/tash8eel/worker.log

# Nginx Access Logs
tail -f /var/log/nginx/access.log

# Or with Docker
docker logs -f tash8eel-api
docker logs -f tash8eel-worker
```

---

## Common Failure Recovery

### 1. WhatsApp Messages Not Sending

**Symptoms:** Messages queued but not delivered

**Diagnosis:**

```bash
# Check Twilio status
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json?PageSize=5" \
  -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

**Recovery:**

1. Check Twilio account balance
2. Verify phone number not blacklisted
3. Check for Twilio service outages
4. Restart message queue worker

```bash
pm2 restart worker
# or
docker restart tash8eel-worker
```

---

### 2. OpenAI Rate Limiting

**Symptoms:** Slow responses, 429 errors

**Diagnosis:**

```bash
grep "429" /var/log/tash8eel/api.log | tail -20
```

**Recovery:**

1. Enable response caching (Redis)
2. Implement exponential backoff (already in place)
3. Upgrade OpenAI tier if persistent
4. Temporarily reduce token budget

```sql
-- Reduce daily token budget
UPDATE merchants SET token_budget_daily = 50000 WHERE id = 'merchant-id';
```

---

### 3. Database Connection Pool Exhausted

**Symptoms:** "too many connections" errors

**Diagnosis:**

```bash
# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

**Recovery:**

1. Kill idle connections

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND query_start < now() - interval '10 minutes';
```

2. Increase pool size in config
3. Restart API with fresh connections

---

### 4. Worker Queue Stalled

**Symptoms:** Jobs not processing, backlog growing

**Diagnosis:**

```bash
# Check Redis queue
redis-cli LLEN bull:jobs:waiting
redis-cli LLEN bull:jobs:active
redis-cli LLEN bull:jobs:failed
```

**Recovery:**

1. Check worker logs for errors
2. Restart worker process
3. If Redis issue, flush stuck jobs:

```bash
redis-cli FLUSHDB  # CAUTION: Clears all queued jobs
```

---

### 5. Payment Processing Failed

**Symptoms:** Payment links not generating, webhooks failing

**Diagnosis:**

```bash
# Check recent payment attempts
grep "payment" /var/log/tash8eel/api.log | tail -50
```

**Recovery:**

1. Verify payment gateway credentials
2. Check webhook URL accessibility
3. Retry failed payments manually:

```bash
curl -X POST https://api.yourapp.com/api/v1/payments/retry \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"paymentId": "pay_xxx"}'
```

---

## Rollback Procedures

### Database Migration Rollback

```bash
# Revert last migration
npm run migration:revert --workspace=apps/api

# Revert to specific migration
npm run typeorm -- migration:revert -t 1706889600000
```

### Application Rollback

```bash
# With PM2 (if using deploy)
pm2 deploy production revert

# With Docker
docker pull tash8eel/api:previous-tag
docker-compose up -d

# With Git
git revert HEAD
npm run build
npm run start:prod
```

### Emergency Database Restore

```bash
# Neon point-in-time recovery
neon branches create --name recovery --parent main --point-in-time "2026-02-01T12:00:00Z"

# Update DATABASE_URL to recovery branch
export DATABASE_URL="postgresql://...recovery-branch..."
```

---

## Support Escalation

### Escalation Matrix

| Severity           | Response Time | Escalation                |
| ------------------ | ------------- | ------------------------- |
| P1 - Service Down  | 15 min        | On-call → Tech Lead → CTO |
| P2 - Major Feature | 1 hour        | On-call → Tech Lead       |
| P3 - Minor Issue   | 4 hours       | Support Team              |
| P4 - Question      | 24 hours      | Documentation / FAQ       |

### Contact Information

- **On-Call Engineer:** Check PagerDuty/OpsGenie rotation
- **Tech Lead:** [internal contact]
- **Twilio Support:** https://support.twilio.com
- **Neon Support:** https://neon.tech/support
- **OpenAI Status:** https://status.openai.com

### Incident Response Template

```markdown
## Incident Report

**Date/Time:** YYYY-MM-DD HH:MM
**Severity:** P1/P2/P3/P4
**Affected Systems:** API / Portal / Worker / Database

### Summary

Brief description of the incident.

### Timeline

- HH:MM - Issue detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Service restored

### Root Cause

Detailed explanation of what went wrong.

### Resolution

What was done to fix it.

### Prevention

Steps to prevent recurrence.
```

---

## Appendix: Quick Commands

```bash
# Check system status
npm run health-check

# View recent errors
grep -i "error\|exception" /var/log/tash8eel/api.log | tail -50

# Restart all services
pm2 restart all

# Clear Redis cache
redis-cli FLUSHDB

# Force sync database schema (DANGEROUS - dev only)
npm run typeorm -- schema:sync

# Generate new API key for merchant
node scripts/generate-api-key.js <merchant-id>

# Check merchant entitlements
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://api.yourapp.com/admin/merchants/<id>/entitlements
```

---

**Document maintained by:** Engineering Team  
**Review cycle:** Monthly or after major incidents
