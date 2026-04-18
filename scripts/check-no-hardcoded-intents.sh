#!/usr/bin/env bash
# check-no-hardcoded-intents.sh
#
# Enforces merchant-generic inbox AI architecture:
#   - no merchant-ID UUID literals in application logic files
#   - no MerchantCategory vertical branches in if/switch conditions
#   - no painter/art-domain Arabic words embedded in logic
#   - no reappearance of the "قولّي اسم المنتج" collapse string
#
# Exits 0 if all checks pass, non-zero with a diagnostic on the first failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${REPO_ROOT}/apps/api/src/application"

fail() {
  echo "❌ $1" >&2
  exit 1
}

if [ ! -d "${APP_ROOT}" ]; then
  echo "ℹ️  Skipping: ${APP_ROOT} not found"
  exit 0
fi

# 1. Collapse string — must never reappear anywhere in source.
if grep -RIn --include='*.ts' --include='*.tsx' -- "قولّي اسم المنتج" "${REPO_ROOT}/apps/api/src" "${REPO_ROOT}/apps/web/src" 2>/dev/null; then
  fail "Found forbidden collapse string \"قولّي اسم المنتج\". Route through merchant KB/catalog context instead."
fi

# 2. Vertical-category branching inside application logic.
# Matches: MerchantCategory.CLOTHES / .FOOD / .SUPERMARKET / .PAINTER / .ART on an if/case/switch line.
# Excludes apps/api/src/application/policies/ — the legitimate home for
# merchant-rule Strategy classes (per CLAUDE.md: "strong separation between
# generic assistant engine and merchant-specific knowledge/rules").
if grep -RInE --include='*.ts' --exclude-dir='policies' \
  '^\s*(if|else if|case|switch)\b.*\bMerchantCategory\.(CLOTHES|FOOD|SUPERMARKET|PAINTER|ART)\b' \
  "${APP_ROOT}" 2>/dev/null; then
  fail "Vertical MerchantCategory branching in application logic. Drive behavior from data, not vertical names."
fi

# 3. Painter/art-domain Arabic words embedded in logic (not allowed inside the
#    generic assistant engine). KB/seed data lives under /docs or /seeds and is
#    not scanned here.
#
# List is narrowed to terms that are unambiguously painter-domain. Words like
# لوحة (also means "dashboard/panel/board") and رسم (also a substring of
# رسمية "formal" and رسالة "message") are too ambiguous to grep for without
# false positives. A leading Arabic-letter lookbehind keeps the match from
# firing inside compound words.
PAINTER_TERMS='(?<![\x{0600}-\x{06FF}])(بورتريه|فنان|رسومات)'
if grep -RInP --include='*.ts' -- "${PAINTER_TERMS}" "${APP_ROOT}" 2>/dev/null; then
  fail "Painter/art-domain Arabic terms found in application logic. These belong in merchant KB, not in code."
fi

# 4. Merchant-ID UUID literals in application logic. UUID v4 pattern.
# Exclusions:
#   - spec/test files (fixtures often need literal IDs).
#   - seed.service.ts (deterministic seed fixtures — their whole purpose is
#     fixed IDs; not production logic).
#   - the all-zeros NULL sentinel UUID commonly used in COALESCE / composite
#     unique indexes.
UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
NULL_UUID='00000000-0000-0000-0000-000000000000'
if grep -RInE --include='*.ts' \
     --exclude='*.spec.ts' --exclude='*.test.ts' \
     --exclude='seed.service.ts' \
     -- "${UUID_RE}" "${APP_ROOT}" 2>/dev/null \
   | grep -v -- "${NULL_UUID}" \
   | grep -q .; then
  grep -RInE --include='*.ts' \
       --exclude='*.spec.ts' --exclude='*.test.ts' \
       --exclude='seed.service.ts' \
       -- "${UUID_RE}" "${APP_ROOT}" 2>/dev/null \
    | grep -v -- "${NULL_UUID}" >&2 || true
  fail "Merchant-ID UUID literal found in application logic. Drive per-merchant behavior from data, not hardcoded IDs."
fi

echo "✅ check-no-hardcoded-intents: all checks passed"
