#!/usr/bin/env bash
# test-ai-reply.sh
#
# End-to-end proof of the demo-merchant AI reply path via HTTP.
# Runs each business-vertical test message through POST /api/v1/inbox/message
# inside the api container (route not exposed on host) and prints per-case:
#   - the customer message
#   - AI reply text
#   - action, mediaAttachments count, model used
#   - PASS/FAIL
#
# Requirements (host side):
#   - jq (used to build JSON bodies, handles Arabic escaping cleanly)
#   - docker, with tash8eel-api-1 running on the compose network
#
# Requirements (env):
#   - API_KEY: a valid 40+ char merchant_api_keys row scoped to demo-merchant
#   - API_CONTAINER (optional): defaults to tash8eel-api-1
#   - PG_CONTAINER (optional): defaults to tash8eel-postgres-1
#
# Usage:
#   API_KEY=tash8eel_xxx ./scripts/test-ai-reply.sh

set -u
set -o pipefail

API_KEY="${API_KEY:-}"
API_CONTAINER="${API_CONTAINER:-tash8eel-api-1}"
PG_CONTAINER="${PG_CONTAINER:-tash8eel-postgres-1}"
MERCHANT_ID="demo-merchant"

if [[ -z "$API_KEY" ]]; then
  echo "error: API_KEY is not set" >&2
  exit 2
fi
command -v jq >/dev/null || { echo "error: jq required on host" >&2; exit 2; }

pass_count=0
fail_count=0
total=0
declare -a FAIL_LINES=()

post_message() {
  local sender="$1"; local text="$2"
  local body
  body="$(jq -nc --arg mid "$MERCHANT_ID" --arg sid "$sender" --arg text "$text" \
    '{merchantId:$mid, senderId:$sid, text:$text}')"
  printf '%s' "$body" | docker exec -i -e API_KEY="$API_KEY" "$API_CONTAINER" sh -c '
    curl -sS -X POST http://localhost:3000/api/v1/inbox/message \
      -H "x-api-key: $API_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @-'
}

active_kb_total() {
  docker exec "$PG_CONTAINER" psql -U neondb_owner -d neondb -tAc \
    "SELECT COUNT(*) FROM merchant_kb_chunks WHERE merchant_id='${MERCHANT_ID}' AND is_active=true;" \
    2>/dev/null | tr -d '[:space:]'
}

run_case() {
  local vertical="$1"; local label="$2"; local sender="$3"; local text="$4"
  total=$((total + 1))

  echo "▶ [$vertical] $label"
  echo "   customer: $text"

  local raw
  raw="$(post_message "$sender" "$text" 2>&1 || true)"

  local reply action media model
  reply="$(printf '%s' "$raw" | jq -r '.replyText // ""' 2>/dev/null || echo '')"
  action="$(printf '%s' "$raw" | jq -r '.action // ""' 2>/dev/null || echo '')"
  media="$(printf '%s' "$raw" | jq -r '(.mediaAttachments // []) | length' 2>/dev/null || echo '0')"
  model="$(printf '%s' "$raw" | jq -r '.modelUsed // ""' 2>/dev/null || echo '')"

  echo "   action=$action, media=$media, model=$model"
  echo "   reply: $reply"

  if [[ -z "$reply" ]]; then
    echo "   ❌ FAIL — empty replyText"
    echo "   raw: $raw"
    FAIL_LINES+=("[$vertical] $label — empty reply")
    fail_count=$((fail_count + 1))
  else
    echo "   ✅ PASS"
    pass_count=$((pass_count + 1))
  fi
  echo
}

kb_total="$(active_kb_total)"
echo "════════════════════════════════════════════════════════"
echo " AI reply proof — merchant=$MERCHANT_ID"
echo " production path: POST /api/v1/inbox/message (via $API_CONTAINER)"
echo " demo-merchant active KB chunks (incl. all verticals): $kb_total"
echo "════════════════════════════════════════════════════════"
echo

# ── Painter / wall art ─────────────────────────────────────────────────────
run_case painter_wall_art "reference image request" "+201000000001" "ممكن تعملي تابلوه زي الصورة دي؟"
run_case painter_wall_art "price for 100x150 with colors" "+201000000001" "عايزاه 100x150 وفيه ألوان بيج ودهبي"
run_case painter_wall_art "wall photo scenario" "+201000000002" "ينفع أبعتلك صورة الحيطة وتشوفي المقاس المناسب؟"
run_case painter_wall_art "delivery and deposit" "+201000000002" "السعر كام والتسليم امتى؟"

# ── Gifts / chocolate / perfume ───────────────────────────────────────────
run_case gifts_chocolate_perfume "perfume giveaway prices (English)" "+201000000003" "Can you please let me know prices for perfumes giveaways?"
run_case gifts_chocolate_perfume "quantity around 200" "+201000000003" "Around 200"
run_case gifts_chocolate_perfume "chocolate plain vs nuts" "+201000000004" "عايزة شوكليت ساده ولا بندق؟"
run_case gifts_chocolate_perfume "reference screenshot" "+201000000004" "ممكن أبعتلك screenshot؟"

# ── Decor / planters ──────────────────────────────────────────────────────
run_case decor_planters "price / availability" "+201000000005" "السعر كام؟"
run_case decor_planters "same shape in black" "+201000000005" "عايز نفس الشكل ده بس لون اسود"
run_case decor_planters "pot with plant?" "+201000000006" "هوا ده بوت بس ولا مع النبات؟"
run_case decor_planters "delivery to Masr El-Gedida" "+201000000006" "التوصيل لمصر الجديدة بكام؟"
run_case decor_planters "wall/space photo intent" "+201000000007" "ممكن ابعتلك صورة المكان وتقوليلي يناسبه ايه؟"

echo "════════════════════════════════════════════════════════"
echo "Summary: $pass_count/$total passed, $fail_count failed"
echo "════════════════════════════════════════════════════════"
if (( fail_count > 0 )); then
  echo "Failed cases:"
  for line in "${FAIL_LINES[@]}"; do echo "  • $line"; done
fi
exit $fail_count
