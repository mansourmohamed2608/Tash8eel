# Search Log (Absence/Presence Checks)

> This log captures targeted searches used to validate "not found" claims.

## IaC / Kubernetes / Helm

Command:

```
rg --files -g "*.tf" -g "*.tfvars" -g "Chart.yaml" -g "values.yaml" -g "kustomization.yaml" -g "*k8s*.yml" -g "*k8s*.yaml" -g "*kubernetes*.yml" -g "*kubernetes*.yaml" -g "helmfile.yaml" -g "!docs/project-scan/**"
```

Result: (no matches)

## Repo Standards Files (.editorconfig / CODEOWNERS / CONTRIBUTING / LICENSE / Templates)

Command:

```
rg --files -g ".editorconfig" -g "CODEOWNERS" -g "CONTRIBUTING.md" -g "LICENSE*" -g ".github/pull_request_template.md" -g ".github/ISSUE_TEMPLATE/*" -g "!docs/project-scan/**"
```

Result: (no matches)

## Pre-commit Hooks (husky / lint-staged)

Command:

```
rg -n "husky|lint-staged" package.json apps/api/package.json apps/worker/package.json apps/portal/package.json
```

Result: (no matches)

## Portal Test Harness (spec/test/cypress/playwright/vitest/jest configs)

Command:

```
rg --files apps/portal -g "**/*.spec.*" -g "**/*.test.*" -g "cypress/**" -g "playwright.config.*" -g "vitest.config.*" -g "jest.config.*"
```

Result: (no matches)

## Order Idempotency Helper Usage

Command:

```
rg -n "generateOrderIdempotencyKey|hashCart" apps/api/src
```

Result:

```
apps/api/src/shared/utils/helpers.ts:22:export const generateOrderIdempotencyKey = (
apps/api/src/shared/utils/helpers.ts:31:export const hashCart = (cart: { items: unknown[]; total: number }): string => {
```

## Portal i18n Frameworks

Command:

```
rg -n "next-intl|react-intl|i18next|next-i18next" apps/portal
```

Result: (no matches)

## React `dangerouslySetInnerHTML` Usage (Portal)

Command:

```
rg -n "dangerouslySetInnerHTML" apps/portal/src
```

Result: (no matches)

## a11y Testing Tooling (jest-axe / playwright-axe / cypress-axe)

Command:

```
rg -n "jest-axe|playwright-axe|cypress-axe" package.json apps/portal/package.json apps/api/package.json apps/worker/package.json
```

Result: (no matches)

Transitive dependency note (not a configured test harness):

```
rg -n "axe-core" package-lock.json
```

Result:

```
5827:    "node_modules/axe-core": {
5829:      "resolved": "https://registry.npmjs.org/axe-core/-/axe-core-4.11.1.tgz",
8093:        "axe-core": "^4.10.0",
```

## Metrics / Tracing Libraries

Command:

```
rg -n "opentelemetry|otel|prometheus|statsd|jaeger|zipkin|datadog|newrelic|honeycomb" package.json apps/api/package.json apps/worker/package.json apps/portal/package.json
```

Result: (no matches)

Transitive dependency note:

```
rg -n "@opentelemetry" package-lock.json
```

Result:

```
11915:        "@opentelemetry/api": "^1.1.0",
11922:        "@opentelemetry/api": {
```

## Data Retention / Deletion Policy Keywords

Command:

```
rg -n "data retention|retention policy|data deletion|deletion policy|gdpr|right to be forgotten" docs apps -g "!docs/project-scan/**"
```

Result: (no matches)

## Backup / Restore Scripts (filename search)

Command:

```
rg --files -g "*backup*" -g "*restore*" -g "!docs/project-scan/**"
```

Result: (no matches)

## Environment Files Inventory

Command:

```
rg --files -g ".env*" -g "!docs/project-scan/**"
```

Result:

```
.env.example
.env
apps/worker/.env
apps/portal/.env.local
apps/api/.env.example
apps/api/.env
```

## Product Analytics SDKs (Segment/Mixpanel/Amplitude/PostHog/GA)

Command:

```
rg -n "posthog|mixpanel|amplitude|google-analytics|segmentio|segment\.com|@segment|\bgtag\b|\bga4\b" apps/portal apps/api
```

Result: (no matches)

## Billing Provider SDKs (Stripe/PayPal/etc.)

Command:

```
rg -n "stripe|paypal|braintree|recurly|chargebee|paddle|checkout\.com|adyen" package.json apps/api/package.json apps/worker/package.json apps/portal/package.json
```

Result: (no matches)

## Onboarding Flow Keywords

Command:

```
rg -n "onboarding|on-board|setup wizard|getting started" apps/portal docs -g "!docs/project-scan/**"
```

Result: (no matches)

## Secret Manager References (Docs Only)

Command:

```
rg -ni "secrets manager|secretsmanager|secretmanager|vault|key vault|parameter store|aws secrets" apps docs -g "!docs/project-scan/**"
```

Result:

```
docs/SECURITY.md:172:- Use Azure Key Vault / AWS Secrets Manager
```

## SCA / Audit Mentions

Command:

```
rg -n "npm audit|snyk|dependabot|trivy|grype" .github docs package.json package-lock.json
```

Result:

```
package.json:44:    "audit:ci": "npm audit --audit-level=high"
docs/GAP_ANALYSIS.md:28:| npm audit | ✅ PASS | 7 LOW severity only (all dev dependencies) |
docs/AUDIT_REPORT.md:78:npm audit
docs/AUDIT_REPORT.md:244:npm audit
docs/CODE_REVIEW.md:261:2. **Update vulnerable dependencies** - Run `npm audit fix`
docs/CODE_REVIEW.md:306:**Recommended Action:** Delete `Ai Agents/` folder, run `npm audit fix`, and commit the cleanup.
docs/RELEASE_CHECKLIST.md:16:| Security Audit | `npm audit --audit-level=high` | 0 |
docs/RELEASE_CHECKLIST.md:104:2. No critical/high vulnerabilities in `npm audit`
```
