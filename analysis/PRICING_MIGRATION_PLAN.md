# Pricing Migration & Action Plan

**Created:** March 13, 2026  
**Objective:** Transition from unsustainable current pricing to sustainable enhanced pricing without causing customer churn

---

## SITUATION

**Current State:**
- 4 pricing tiers: Starter ($59), Growth ($129), Pro ($269), Enterprise ($579)
- Based on variable costs only (~46% gross margin average)
- Ignores: support hours, infrastructure overhead, feature complexity, risk buffers

**Outcome:**
- Company shows healthy "gross margin" (66%) but negative actual profitability
- At expected utilization + any cost inflation, most tiers are loss-making
- Company runway: ~12–18 months before overhead exhaustion

**Decision Needed:**
- Accept current pricing (path to bankruptcy)
- **Adopt enhanced pricing** (path to sustainability)

---

## ENHANCED MODEL PRICING (TARGET)

| Tier | Current | Enhanced | Multiple | Monthly Uplift | Notes |
|------|---------|----------|----------|--------|-------|
| Starter | $59 | $104 | 1.76× | +$45 | Entry tier, self-serve, AI-lite |
| Growth | $129 | $159 | 1.23× | +$30 | Mid-market, includes forecasting |
| Pro | $269 | $1,220 | 4.53× | +$951 | Advanced features, dedicated support, call API |
| Enterprise | $579 | $3,254 | 5.62× | +$2,675 | Full platform, white-glove support, SLA |

---

## MIGRATION STRATEGY

### Option A: "COLD TURKEY" (High Risk, High Reward)
**Timeline:** Implement immediately for all new customers, grandfather existing

**Pros:**
- Maximum new revenue immediately
- Signals serious commitment to sustainability
- Attracts venture capital (shows sustainability math)

**Cons:**
- Existing customers churn at likely 40–60% (huge customer loss)
- Terrible optics (suddenly 5× more expensive)
- May lose market share to competitors on current pricing

**Recommendation:** ⚠️ **NOT RECOMMENDED** unless you want to tank customer count

---

### Option B: "PHASED MIGRATION" ⭐ (Recommended)
**Timeline:** 3-phase over 6 months

#### **Phase 1: Today (Month 0)**
**Action:** Lock in current pricing for ALL customers with annual prepay (15% discount)
```
If customer signs annual contract:
  Starter: $59 × 12 × 0.85 = $600/year
  Growth: $129 × 12 × 0.85 = $1,317/year
  Pro: $269 × 12 × 0.85 = $2,745/year
  Enterprise: $579 × 12 × 0.85 = $5,905/year

Result:
  ✅ Locks in existing customers for 12 months
  ✅ Improves cash flow immediately (annual upfront)
  ✅ Buys time for Phase 2 implementation
  ✅ Existing customers feel "rewarded" for loyalty
```

**Implementation:**
- Email: "We're offering early-adopter pricing lock-in for 12 months if you prepay annually"
- Offering: "Save 15% + lock in today's price for the full year"
- Deadline: "Offer expires March 31, 2026"
- Expected conversion: 40–60% of existing customers

---

#### **Phase 2: Month 3**
**Action:** New customers at +50% pricing (middle ground between current and enhanced)
```
New customers starting April 1:
  Starter: $59 → $88 (+49%)
  Growth: $129 → $193 (+50%)
  Pro: $269 → $404 (+50%)
  Enterprise: $579 → $869 (+50%)

Result:
  ✅ Tests market acceptance of higher pricing
  ✅ Increases monthly revenue per new customer 50%
  ✅ Gives existing customers time to adapt
  ✅ Grandfathers prepay cohort at $59 during their 12 months
```

**Messaging:**
- "We've invested in advanced features (forecasting, smart calling, autonomous agents)"
- "Support team is now available 24/7 for Pro+ customers"
- "Infrastructure upgraded for 99.9% uptime guarantee"
- "Risk buffer added: system now handles seasonal spikes without degradation"

---

#### **Phase 3: Month 6**
**Action:** Full migration to enhanced pricing for everyone (old and new)
```
All customers at renewal / next month:
  Starter: $59 → $104 (+76%)
  Growth: $129 → $159 (+23%)  [smallest jump]
  Pro: $269 → $1,220 (+354%) [biggest jump; mitigate with feature unlocks]
  Enterprise: $579 → $3,254 (+462%) [biggest jump; extensive support + SLA]

Result:
  ✅ All customers now on sustainable pricing
  ✅ Company runway increases from 18 months → 5+ years
  ✅ Existing customers have 6 months notice (Phases 1+2)
  ✅ Customers upgrading get new features included (forecast, call API, etc.)
```

**Timeline for existing customers:**
```
Prepay customer (locked at Phase 1):
  Mar 0:  Sign $600/year prepay (original $708 annual) → saves $108
  Mar 12: Annual renewal → now offered full enhanced pricing ($1,248)
          Expected reaction: "Wait, I saved $108 last year. This is a jump, but I've used it for a year."
          Retention: likely 70% (felt good value + time to adjust)

Monthly customer (no prepay):
  Mar 0:  Offered prepay option; declines
  Apr 1:  New billing cycle → upgraded to Phase 2 pricing (+50%)
  Jul 1:  New billing cycle → upgraded to Phase 3 pricing (additional 50%)
  Result: 100% increase over 4 months feels less painful than 5× immediate
```

---

### Option C: "MARKET SEGMENTATION" (Alternative/Hybrid)
**Build different pricing for different customer segments:**

```
SEGMENT 1: High-volume merchants (100+ WhatsApp conversations/day)
  → Use current pricing (they're not profitable yet, grow volume first)
  → Convert to enhanced pricing once they hit profitability threshold

SEGMENT 2: Professional/Enterprise (complex workflows, call API, forecasting)
  → Use enhanced pricing immediately (they're the value segment)
  → These are willing to pay for advanced features

SEGMENT 3: SMB/Retail (simple inventory + order management, no AI)
  → Create "Core" $29/month tier (COGS-only, forecasting/call API removed)
  → Upsell to Growth ($159) when they're ready for AI features

Result:
  ✅ Existing customers stay on current pricing (different tier)
  ✅ Pro+Enterprise migrations feel "fair" (they get real value)
  ✅ New SMB customers onboard at lower entry price ($29)
  ✅ Flexibility for market conditions & customer LTV
```

---

## RECOMMENDED: PHASED MIGRATION + MARKET SEGMENTATION

Combine best of Option B (phased) + Option C (segmentation):

### **PHASE 1: LOCK & SEGMENT (This Week, by EOQ 2026 Q1)**

1. **Email existing customers:**
   ```
   Subject: Early-Adopter Lock-In: Save 15% + Keep Your Price for 12 Months
   
   Dear [Merchant Name],

   You've been with us since [signup date]. We want to ensure this remains affordable.

   We're offering current customers an exclusive deal: prepay for annual service and lock in 
   today's pricing for the full 12 months, plus 15% savings.

   [Starter: $600/year] [Growth: $1,317/year] [Pro: $2,745/year] [Enterprise: $5,905/year]

   This offer expires March 31, 2026.

   [Prepay Button]
   ```

2. **Simultaneously offer "Core" tier for new customers:**
   ```
   Core Tier: $29/month
   - WhatsApp order management
   - AI-powered basic assistant
   - Inventory tracking
   - Payment proof verification
   - NO advanced features (no forecasting, smart calling, autonomous agent)
   - Great for single-merchant shops learning the platform
   ```

3. **New customer offers by segment:**
   - SMB/retail: Core ($29) or Growth ($193 in Phase 2)
   - Professional users: Pro ($269 current; testing with Phase 2)
   - Enterprise deals: Enterprise tier ($579 current; negotiable)

---

### **PHASE 2: PREMIUM ROLLOUT (Month 2–3, April 2026)**

1. **New customers** now offered:
   ```
   Core: $29/month
   Starter: $88/month (+$29 = mid-tier option)
   Growth: $193/month
   Pro: $404/month
   Enterprise: $869/month (custom negotiation)
   ```

2. **Messaging shift:**
   - Emphasize NEW advanced features (forecasting, call API, 24/7 support)
   - Show differentiation: "Pro tier includes smart calling (unavailable in Starter)"
   - Create urgency: "Forecast-driven merchants grow 3× faster (case study link)"

3. **Expected outcomes:**
   - 60% of Phase 1 prepay customers renew at Phase 3 pricing (loyal)
   - 25% churn but negotiate down to Growth tier (price-elastic)
   - 40% of new customers sign at Phase 2 pricing (growth segment)
   - MRR uplift: +30% from new customer premium pricing

---

### **PHASE 3: COMPLETE MIGRATION (Month 5–6, June 2026)**

1. **All renewals** now at enhanced pricing
   ```
   Core: $29/month (unchanged)
   Starter: $104/month
   Growth: $159/month (modest increase from Phase 2)
   Pro: $1,220/month (HUGE jump, but features justify it)
   Enterprise: $3,254/month (custom support justifies it)
   ```

2. **Pro+ customers receive feature bundles:**
   - **Pro tier unlocks:** Demand forecasting, autonomous agent, smart calling
   - **Enterprise tier unlocks:** Call recording, white-glove support, custom SLA, dedicated SM
   - **Core/Starter: Can add features à la carte** ($120/month for forecasting, $200/month for smart calling)

3. **Expected outcomes:**
   - 65% of Phase 2 customers renew (most stick with platform)
   - 15% downgrade from Pro → Growth (price-elastic ABM analysis)
   - 20% new customer signups at full pricing
   - MRR uplift: Additional +80% from existing customer migrations
   - **Final MRR:** 2.5–3× higher than current

---

## CHURN MITIGATION TACTICS

### **Pro Tier Special Focus** (Highest risk, highest value)

**Problem:** Pro jumps from $269 → $1,220 (4.5×)  
**Solution:**

1. **Direct CFO/Finance call (personalized outreach)**
   - "We noticed you've been using forecasting heavily. We're launching an enterprise-grade implementation with dedicated support."
   - "Your current bill: $269/month. Forecast ROI based on your usage: $5k/month in better inventory decisions"
   - "New pricing: $1,220/month, which pays for itself in forecast accuracy alone"

2. **Feature reveal for Pro tier:**
   - Autonomous agent (auto-place orders, follow up on unpaid invoices)
   - Smart calling (AI outbound to customers, recovery calls)
   - Call recording + transcription (quality coaching)
   - Advanced audit logs (for larger teams)
   - **Message: "These features alone justifies the upgrade"**

3. **Grandfathering option:**
   - "Pro customers from our first 30 days can stay at $500/month for 12 months (discount path)"
   - Requires annual prepay commitment
   - Expected acceptance: 30–40% (better than 0%, locks revenue)

### **Growth Tier Sweet Spot**

**Problem:** Growth jumps $129 → $159 (only 23%)  
**Advantage:** Smallest increase = easiest to retain  
**Strategy:** Make this the "default upgrade" path for Starter churn prevention

---

## REVENUE IMPACT PROJECTION

### **Scenario: 120 customers (per internal model)**
```
Distribution (assumed):
  Starter: 40 customers (33%)
  Growth: 35 customers (29%)
  Pro: 30 customers (25%)
  Enterprise: 15 customers (13%)

Current State (Month 0):
  ─────────────────────────────────
  Starter:    40 × $59  = $2,360/mo    $(27% of MRR)
  Growth:     35 × $129 = $4,515/mo    $(41% of MRR)
  Pro:        30 × $269 = $8,070/mo    $(25% of MRR)
  Enterprise: 15 × $579 = $8,685/mo    $(7% of MRR)
  ─────────────────────────────────
  TOTAL MRR:                $23,630/mo

Phase 1 Outcome (Month 3, after prepay lock-in):
  [50% of customers prepay at current rates]
  ─────────────────────────────────
  Same MRR: $23,630/mo  (but $7,090 collected upfront as annual subscriptions)
  Cash position: +$7,090/mo annualized into checking account immediately

Phase 2 Outcome (Month 4, new customers at +50%):
  [Assume 10 new customer additions at Phase 2 pricing]
  ─────────────────────────────────
  New customers:    [5×$88 + 3×$193 + 2×$404] = $1,650/mo added
  Existing (Phase 1): $23,630/mo (mostly unchanged)
  TOTAL MRR:                $25,280/mo  (+6.9% growth)

Phase 3 Outcome (Month 7, full migration at enhanced pricing):
  [Assume 65% retain, 20% downgrade, 15% churn from Pro tier]
  ─────────────────────────────────
  Starter:    45 × $104  = $4,680/mo   (retained 40 + 5 new)
  Growth:     42 × $159  = $6,678/mo   (retained 35 + 7 upgraded from Starter, -2 downgraded from Pro)
  Pro:        20 × $1,220 = $24,400/mo (retained 30×0.65 - 6 downgrade, - 5 churn)
  Enterprise: 13 × $3,254 = $42,302/mo (retained 15×0.87, strong market for enterprise)
  ─────────────────────────────────
  TOTAL MRR:                $78,060/mo  (+230% vs Month 0!)

Professional Summary:
  Month 0:   $23,630 MRR
  Month 7:   $78,060 MRR  (+$54,430 = +230% increase)
  Impact:    Company runway improves from 18 months → 4+ years of sustainability
```

---

## GO/NO-GO DECISION CRITERIA

**Proceed with migration if:**
- [ ] CFO agrees current pricing is unsustainable
- [ ] Pricing must reflect true cost structure (or company dies in 18 months)
- [ ] Pro+Enterprise segments are willing to pay for advanced features (validation needed)
- [ ] Team can handle support volume increase (expect churn calls in Phase 2)
- [ ] Marketing can tell the story: "More features, more infrastructure, better support = fair price"

**DO NOT proceed if:**
- [ ] Investors are unhappy with price increases (short-term optics)
- [ ] Team doesn't believe in feature value (message won't be authentic)
- [ ] Competitors are aggressively undercutting prices (market fight)
- [ ] Company culture is "growth at all costs" (won't survive downturn with thin margins)

---

## IMPLEMENTATION CHECKLIST

### **Week 1**
- [ ] Share this migration plan with CFO, Product, Sales
- [ ] Get CFO sign-off on enhanced pricing must happen
- [ ] Draft customer communication email (Phase 1: lock-in offer)
- [ ] Create Core tier product definition ($29/month)

### **Week 2**
- [ ] Segment existing customer list by churn risk (Pro at highest risk)
- [ ] Set up pricing tiers in billing system (Core + enhanced pricing)
- [ ] Prepare sales collateral: "Why Pro is now $1,220 (and worth it)"
- [ ] Calculate Phase 2 pricing ($88 / $193 / $404 / $869)

### **Week 3**
- [ ] Send Phase 1 lock-in offer email to all existing customers
- [ ] Track prepay conversion rate (goal: 50%)
- [ ] Launch Core tier for new lead flow
- [ ] Monitor churn/escalations closely

### **Month 2–3 (Phase 2)**
- [ ] All new customers → Phase 2 pricing (+50%)
- [ ] Pro tier CFO calls (mitigate churn)
- [ ] Feature launches for Pro+ (forecasting, smart calling, autonomous agent)
- [ ] Quarterly business review with top customers (justify pricing)

### **Month 5–6 (Phase 3)**
- [ ] Existing customers migrate to enhanced pricing at renewal
- [ ] Track retention by cohort (50/50 discount clients, monthly clients)
- [ ] Capture wins: "Merchant XYZ revenue grew 5× with forecasting"
- [ ] Adjust pricing if market signals warrant (unlikely, but monitor)

---

## SUCCESS METRICS

| Metric | Target | Acceptable | Red Flag |
|--------|--------|-----------|----------|
| Phase 1 prepay conversion | 60% | 40% | <30% (customers don't trust pricing) |
| Phase 2 new customer take-up | 80% at +50% pricing | 60% | <40% (market resisting increase) |
| Pro tier churn | <25% | <35% | >40% (feature value not communicating) |
| System-wide MRR uplift (Month 7) | +230% | +150% | <100% (migration not working) |
| Customer NPS during migration | >40 | >30 | <20 (communication failing) |
| Pro feature adoption (Post-Phase 3) | >60% of Pro customers | >40% | <30% (upsell not working) |

---

## RISK MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| High churn during Phase 3 | Medium | High | Grandfathering offer for Pro tier (-30% for 12mo) |
| Competitors undercut prices | Medium | Medium | Differentiate on feature value + support quality |
| Internal team saturation | High | High | Hire support staff before Phase 2; automate L1 |
| Investor pushback on "raising prices" | Low | High | Share sustainability projections; show bankruptcy risk at current pricing |
| Customer support overwhelmed by migration questions | High | Medium | Create FAQ, schedule office hours, assign billing support person full-time |

---

## QUESTIONS FOR LEADERSHIP

1. **CFO:** Do you agree current pricing is unsustainable? What's your preferred migration pace?
2. **Product:** Can we ship forecasting, smart calling, autonomous agent by Phase 3? (Justifies Pro price jump)
3. **Sales:** Can your team handle Pro tier churn calls? Which customers are most at-risk?
4. **Marketing:** Can you tell the story authentically? "Price increase = more investment in infrastructure + support"?
5. **Investors:** Will they support a 230% MRR increase even if customer count dips 10–15%? (Revenue > customer count)

---

**Next Step:** Schedule 1-hour meeting with CFO + Product to decide: green-light Phase 1 email by EOW?

**Timeline to breakeven:** 6 months  
**Timeline to 5-year runway:** 3 months into Phase 3  
**Decision deadline:** This week (let current run continue = bankruptcy path)
