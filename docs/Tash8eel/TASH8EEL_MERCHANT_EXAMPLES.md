# TASH8EEL_MERCHANT_EXAMPLES

Last updated: 2026-04-15

Purpose:
These are reference merchant examples used to test whether Tash8heel AI behaves like a true multi-business SaaS rather than a hardcoded single-vertical bot.

Important:

- These are test/reference merchants
- They define expected AI behavior by business type
- They are not final customer truth
- They are used to validate generic architecture, KB/RAG, and escalation behavior

---

## 1. ONLINE PAINTING STORE

### Business type

Custom art / paintings / commission-based creative business

### What they sell

- custom paintings
- portrait paintings
- abstract pieces
- selected themed styles
- framed / unframed options

### Customer behaviors

- some know exactly what they want
- some do not know the type/style
- many send a reference image
- some ask for unsupported styles
- some ask if their photo can be painted

### AI should do

- ask clarifying questions
- classify image/style if possible
- compare request against supported/unsupported styles
- guide confused customers
- capture order intent
- explain timing / pricing rules if available

### AI should not do

- promise unsupported painting types
- invent artistic capabilities
- assume complex material consumption logic
- confirm a style with false certainty

### Escalate when

- style is ambiguous
- customer asks for unsupported/unclear custom work
- quote needs manual approval
- image is low-confidence / unclear

---

## 2. RESTAURANT / FAST CASUAL

### Business type

Food & beverage

### What they sell

- menu items
- combos
- add-ons
- delivery / pickup
- branch-based operations

### Customer behaviors

- asks about menu
- asks what to choose
- places order
- asks for branch / delivery time
- complains about order delays or missing items

### AI should do

- answer menu questions
- recommend based on available menu/rules
- help place order
- check delivery/pickup policies
- escalate order issues when needed

### AI should not do

- invent unavailable dishes
- override branch availability
- promise delivery time without live/order-aware logic

### Escalate when

- refund/cancellation issue
- payment problem
- unavailable menu conflict
- customer complaint / order correction

---

## 3. CLOTHING / FASHION STORE

### Business type

Online retail / apparel

### What they sell

- clothing items
- sizes
- colors
- variants
- seasonal stock

### Customer behaviors

- asks about size fit
- asks if item is available in color/size
- sends screenshots or inspiration photos
- asks for recommendations

### AI should do

- retrieve catalog/variant data
- answer based on actual size/color availability
- guide buyer when unsure
- suggest alternatives if stock is unavailable

### AI should not do

- invent stock
- guess fit beyond merchant policy
- promise unavailable colors or sizes

### Escalate when

- customer asks for a customization the store doesn’t offer
- fit/size concern becomes sensitive or uncertain
- return/exchange conflict

---

## 4. FURNITURE / DECOR STORE

### Business type

Furniture / home decor / made-to-order items

### What they sell

- ready items
- custom dimensions
- finishes/materials
- delivery/installation windows

### Customer behaviors

- asks if a piece can be customized
- sends room or style images
- asks about dimensions/materials
- asks for quote or lead time

### AI should do

- collect measurements and intent
- compare request to supported customization rules
- guide based on available finishes/options
- escalate if quote requires manual approval

### AI should not do

- promise impossible customizations
- invent materials/lead times
- confirm installation details without rules

### Escalate when

- custom dimensions exceed rules
- quote requires manual review
- customer asks for design judgment beyond configured logic

---

## 5. FLOWERS / GIFTS SHOP

### Business type

Gift shop / bouquet / event gifting

### What they sell

- bouquets
- gift boxes
- event arrangements
- same-day / scheduled delivery

### Customer behaviors

- asks for recommendations
- doesn’t know what to choose
- asks for budget-based options
- needs urgent delivery
- sends example photos

### AI should do

- guide customers by occasion, budget, and taste
- narrow down options
- confirm available categories
- handle order capture

### AI should not do

- guarantee urgent availability unless rules permit
- invent floral arrangements not in catalog
- ignore delivery cutoffs

### Escalate when

- urgent/custom request exceeds rules
- event-specific arrangement needs manual review

---

## 6. PHARMACY / HEALTH PRODUCTS

### Business type

Pharmacy / OTC products / health supplies

### What they sell

- OTC meds
- wellness products
- health accessories

### Customer behaviors

- asks for product info
- asks for alternative products
- may ask medically sensitive questions

### AI should do

- answer catalog / availability / general info
- help route to available products
- stay within merchant-safe rules

### AI should not do

- give medical diagnosis
- recommend prescription-only medication
- provide dangerous health advice

### Escalate when

- medical advice is requested
- restricted items are involved
- health risk appears

---

## 7. UNIVERSAL TEST QUESTIONS

Every merchant example should be tested against:

1. customer knows exactly what they want
2. customer does not know what they want
3. customer sends image
4. customer sends voice note
5. customer asks unsupported request
6. customer asks price
7. customer asks timing
8. customer complaint / issue
9. low-confidence case
10. human escalation case

---

## 8. FINAL RULE

If the assistant architecture only works well for one of these merchants, the SaaS is still too hardcoded.
