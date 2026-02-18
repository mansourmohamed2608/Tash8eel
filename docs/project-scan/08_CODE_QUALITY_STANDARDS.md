# Phase 7 - Clean Code & Consistency Standards

## Current Standards Found

- Prettier and ESLint are present in API/Worker packages. Evidence: `apps/api/package.json:9-18`, `apps/worker/package.json:10-18`.
- Next.js linting is configured for portal. Evidence: `apps/portal/package.json:6-9`.

## Recommended Repo Standards (Missing)

- **.editorconfig** for consistent editor formatting. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.
- **CODEOWNERS** for review ownership. **Not found in repository** (no .github/CODEOWNERS). Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.
- **CONTRIBUTING.md** for onboarding. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.
- **PR template** and **issue templates** to standardize changes. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.
- **Conventional commits** (optional) for release automation. **Not found in repository** (no config or enforcement). Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.
- **Pre-commit hooks** (husky/lint-staged). **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:21-27`.

## Suggested Standards Package (Proposed)

- Add `.editorconfig` (spaces, LF, trim trailing whitespace).
- Add `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/*`.
- Add `CONTRIBUTING.md` describing local setup, test commands, and coding conventions.
- Add `CODEOWNERS` for app boundaries (api/worker/portal).
- Add lint-staged + husky to enforce formatting before commit.

## Testing Baseline Recommendation

- API: keep Jest unit/e2e tests; add coverage thresholds. Evidence: `apps/api/package.json:91-121`.
- Portal: introduce component/unit tests with React Testing Library + Vitest or Jest.
- Worker: add service-level tests for outbox and orchestrator.
