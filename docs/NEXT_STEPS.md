# Tash8eel Production Next Steps

## Current State (Session 5 Complete)

| Area           | Status                                     |
| -------------- | ------------------------------------------ |
| API Build      | ✅ 0 TypeScript errors                     |
| Worker Build   | ✅ 0 TypeScript errors                     |
| Portal Build   | ✅ 0 TypeScript errors                     |
| Neon DB        | ✅ 120 tables (migrations 001-064 applied) |
| Demo Seed      | ✅ 14/14 domains, 75 tables, 0 skipped     |
| Dead Tables    | ✅ 20 dropped (migration 062)              |
| Missing Tables | ✅ 10 created (migrations 063-064)         |

---

## Phase 1: Pre-Launch Essentials (Week 1)

### 1. Environment & Secrets

- [ ] Create `.env.production` with all required variables
- [ ] Set up secrets manager (AWS SSM / Azure Key Vault / Doppler)
- [ ] Production `DATABASE_URL` (Neon Pro or dedicated Postgres)
- [ ] Production `REDIS_URL` (Upstash / ElastiCache)
- [ ] `JWT_SECRET` — generate 256-bit random key
- [ ] `ENCRYPTION_KEY` — for PII encryption at rest
- [ ] `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_VERIFY_TOKEN`
- [ ] `OPENAI_API_KEY` for GPT-4o-mini agent brain
- [ ] `WEBHOOK_SECRET` for inbound Meta webhooks

### 2. Meta WhatsApp Business API

- [ ] Create Meta Business account + WhatsApp Business Platform app
- [ ] Get Business Verification approved (takes 3-7 days)
- [ ] Register phone number + set webhook URL
- [ ] Configure message templates (Arabic) and get approved
- [ ] Set inbound webhook → `POST /api/v1/webhooks/meta`
- [ ] Test end-to-end: customer message → conversation → AI response

### 3. Database Production Hardening

- [ ] Enable Neon connection pooling (PgBouncer)
- [ ] Set up automatic daily backups + point-in-time recovery
- [ ] Run `ANALYZE` on all tables after seed
- [ ] Add DB-level row-level security for multi-tenant isolation
- [ ] Index audit: verify critical query paths have indexes
- [ ] Set `statement_timeout` and `idle_in_transaction_session_timeout`

### 4. Docker & Deployment

- [ ] Finalize Dockerfiles (`apps/api/Dockerfile`, `apps/portal/Dockerfile`, `apps/worker/Dockerfile`)
- [ ] Create `docker-compose.production.yml` with health checks
- [ ] Deploy to target platform:
  - **Option A**: Railway / Render (simplest, ~$25/mo)
  - **Option B**: AWS ECS Fargate / Azure Container Apps
  - **Option C**: VPS with Docker Compose (Hetzner €10/mo)
- [ ] Set up auto SSL via Let's Encrypt / Cloudflare
- [ ] Configure custom domain (e.g., `api.tash8eel.com`, `app.tash8eel.com`)

---

## Phase 2: Observability & Security (Week 2)

### 5. Monitoring & Logging

- [ ] Structured JSON logging → ship to Grafana Cloud / Datadog / Axiom
- [ ] Application metrics: request latency, error rate, seed health
- [ ] Uptime monitoring: UptimeRobot / Better Stack for API + Portal
- [ ] Set up alerts: 5xx spike, DB connection exhaustion, agent failures
- [ ] Neon DB dashboard for slow queries + connection metrics

### 6. Error Tracking

- [ ] Integrate Sentry (API + Portal + Worker)
- [ ] Configure release tracking + source maps
- [ ] Set up Slack/Telegram alert channel for P0 errors

### 7. Security Hardening

- [ ] Enable CORS whitelist (only allow portal domain)
- [ ] Rate limiting is in place (ThrottlerModule) — verify production limits
- [ ] Helmet middleware headers (already present, verify X-Frame-Options etc.)
- [ ] CSP headers on Portal
- [ ] API key rotation policy for merchant API keys
- [ ] Enable audit log retention policy (90-day auto-archive)

---

## Phase 3: Business Readiness (Week 3)

### 8. Payment Integration

- [ ] Integrate payment gateway (Paymob for Egypt — most popular)
- [ ] Implement `POST /api/v1/billing/checkout` → Paymob session
- [ ] Handle Paymob webhooks for payment confirmation
- [ ] Wire up `merchant_subscriptions` status changes on payment events
- [ ] Test: Free trial → add credit card → activate Pro plan → agents unlock

### 9. Onboarding Flow

- [ ] Merchant sign-up page (email + phone + business name)
- [ ] Auto-provision: create merchant → default plan → sandbox WhatsApp
- [ ] First-run wizard: connect WhatsApp number → import catalog → send test message
- [ ] Demo mode: auto-seed demo data for new merchants (sandbox only)

### 10. Portal Polish

- [ ] Login/sign-up pages (currently stubs)
- [ ] Mobile responsive testing (Egyptian merchants use phones heavily)
- [ ] Arabic RTL layout verification across all pages
- [ ] Loading states, error boundaries, empty states for all pages
- [ ] Toast notifications for async operations

---

## Phase 4: Testing & Launch (Week 4)

### 11. Testing

- [ ] API integration tests (currently have test stubs in `test/`)
- [ ] E2E: Full order lifecycle (WhatsApp message → order → delivery → followup)
- [ ] Load test: simulate 100 concurrent WhatsApp conversations
- [ ] Verify agent brain handles Arabic slang/dialects correctly
- [ ] Payment flow E2E with Paymob sandbox

### 12. Compliance & Legal

- [ ] Terms of Service + Privacy Policy (Arabic + English)
- [ ] GDPR/data protection compliance for customer PII
- [ ] WhatsApp Commerce Policy compliance check
- [ ] Data retention policy documentation

### 13. Soft Launch

- [ ] Seed 3-5 beta merchants (friends/partners)
- [ ] Monitor for 1 week: error rates, agent accuracy, payment success
- [ ] Gather feedback, iterate on Arabic UX
- [ ] Fix any production-only issues

### 14. Public Launch

- [ ] Landing page at `tash8eel.com`
- [ ] Pricing page with Egyptian Pound pricing
- [ ] Documentation / help center (Arabic)
- [ ] Social media presence (Instagram, Facebook — big in Egypt)
- [ ] WhatsApp Business catalog for own marketing

---

## Quick Wins You Can Do Right Now

| #   | Task                             | Time   | Impact                        |
| --- | -------------------------------- | ------ | ----------------------------- |
| 1   | Create Meta Business account     | 15 min | Unblocks WhatsApp integration |
| 2   | Set up Sentry free tier          | 20 min | Error visibility from day 1   |
| 3   | Configure Neon production branch | 10 min | Separate dev/prod data        |
| 4   | Deploy API to Railway            | 30 min | Live API endpoint             |
| 5   | Deploy Portal to Vercel          | 15 min | Live dashboard                |
| 6   | Generate production JWT secret   | 5 min  | Security baseline             |

---

## Architecture Reference

```
Internet → Cloudflare (CDN + WAF)
  ├── app.tash8eel.com → Vercel (Next.js Portal)
  ├── api.tash8eel.com → Railway/ECS (NestJS API)
  └── webhooks → api.tash8eel.com/api/v1/webhooks/meta

NestJS API ↔ Neon Postgres (120 tables)
         ↔ Redis (sessions, cache, rate limits)
         ↔ OpenAI GPT-4o-mini (agent brain)

Worker (background) ↔ same DB + Redis
  ├── 6 AI Agents (Ops, Inventory, Finance, Marketing, Support, Content)
  ├── 5 Cron Schedulers
  └── Autonomous Brain (12 checks)
```
