# Phase 5 - DevOps, CI/CD, Deployment

## Containerization

- **Dockerfiles** for API, Worker, Portal using node:20-alpine. Evidence: `apps/api/Dockerfile:1-63`, `apps/worker/Dockerfile:1-63`, `apps/portal/Dockerfile:1-63`.
- **docker-compose** defines Postgres, Redis, API, Worker, Portal, and optional pgAdmin. Evidence: `docker-compose.yml:1-120`.
- **Test stack** uses pgvector image for e2e. Evidence: `docker-compose.test.yml:7-35`.

## CI/CD

- GitHub Actions pipeline with lint/build/unit/e2e/docker-build. Evidence: `.github/workflows/ci.yml:1-181`.
- CI builds Docker images but does not push/deploy (push: false). Evidence: `.github/workflows/ci.yml:163-178`.

## Environment Separation

- .env files exist for root, API, Worker, Portal. Evidence: `.env:1-54`, `apps/api/.env:1-68`, `apps/worker/.env:1-31`, `apps/portal/.env.local:1-6`.
- No explicit staging/prod environment files beyond the .env\* inventory. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:118-132`.

## Secrets Management

- Secrets are stored in .env files inside the repo (see security findings). Evidence: `.env:22-44`, `apps/api/.env:8-15`, `apps/worker/.env:1-8`.
- Docs recommend secret managers, but no integration code/config found. **Not found in repository**. Evidence: `docs/SECURITY.md:172`, `docs/project-scan/12_SEARCH_LOG.md:158-167`.

## Build / Release

- Monorepo builds via npm workspaces. Evidence: `package.json:10-36`.
- API/Worker use nest build, portal uses next build. Evidence: `apps/api/package.json:9-14`, `apps/worker/package.json:10-15`, `apps/portal/package.json:6-8`.

## Observability

- Pino logging and health endpoints. Evidence: `apps/api/src/shared/logging/logger.ts:1-90`, `apps/api/src/api/controllers/health.controller.ts:24-110`.
- No explicit metrics/tracing libraries configured (only transitive deps in lockfile). **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:84-99`.

## Scaling & SPOFs

- Single Postgres instance (compose), Redis optional; API/Worker are stateless. Evidence: `docker-compose.yml:1-114`, `apps/api/src/infrastructure/redis/redis.service.ts:13-120`.
- No queue broker beyond DB outbox. **Not found in repository**. Evidence: `apps/api/src/application/events/outbox.service.ts:1-128`, `apps/worker/src/outbox/outbox-poller.service.ts:34-120`.

## Local Developer Setup

- Root README includes setup steps for Docker, migrations, and start commands. Evidence: `README.md:73-140`.
