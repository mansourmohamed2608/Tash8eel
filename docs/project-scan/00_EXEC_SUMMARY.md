# Executive Summary

## What This Repo Is

- A monorepo for Tash8eel: NestJS API + NestJS worker + Next.js portal for an AI-powered WhatsApp commerce agent. Evidence: `package.json:6-23`, `apps/api/package.json:1-66`, `apps/worker/package.json:1-41`, `apps/portal/package.json:6-33`.
- Primary integrations: OpenAI (LLM + transcription) and Twilio WhatsApp. Evidence: `apps/api/src/application/llm/llm.service.ts:1-120`, `apps/api/src/application/adapters/twilio-whatsapp.adapter.ts:1-120`.

## Key Risks & Blockers

1. **Secrets are committed in .env files** (OpenAI, Twilio, Neon DB). Evidence: `.env:22-44`, `apps/api/.env:8-15`, `apps/worker/.env:1-8`.
2. **Tenant isolation gaps**: merchant-scoped endpoints use merchantId params without verifying against authenticated merchant. Evidence: `apps/api/src/api/controllers/analytics.controller.ts:12-70`, `apps/api/src/api/controllers/inventory.controller.ts:275-336`.
3. **Unguarded admin endpoint** at /admin/early-access. Evidence: `apps/api/src/api/controllers/early-access.controller.ts:164-205`.
4. **WebSocket auth trusts client-supplied merchantId**. Evidence: `apps/api/src/infrastructure/websocket/events.gateway.ts:47-82`.

## Top Wins (Highest ROI)

- Remove committed secrets and rotate keys. Evidence: `.env:22-44`.
- Enforce merchant scoping in controllers via guard or MerchantId decorator. Evidence: `apps/api/src/shared/decorators/merchant-id.decorator.ts:1-14`.
- Fix portal API correctness (duplicate portalApi methods, loyalty route). Evidence: `apps/portal/src/lib/authenticated-api.ts:296-405`, `apps/api/src/api/controllers/loyalty.controller.ts:16-21`.
