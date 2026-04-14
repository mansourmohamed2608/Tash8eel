# Tash8heel repo instructions

Tash8heel is an enterprise-leaning merchant operating system and AI-brain-driven SaaS for:

- big multi-branch restaurants
- café chains
- branch-heavy food businesses

Core architecture rules:

- Copilot = one merchant-facing assistant interface
- AI brain = deeper planner/orchestration/control layer across the SaaS
- GPT usage must be event-driven, scheduled, or on-demand
- GPT must not be treated as always-on 24/7
- deterministic systems remain source of truth
- Meta is messaging backbone
- Twilio is calls-only

Execution rules:

- implementation-first, validation-second
- do not restart discovery from zero
- do not overclaim enterprise completeness
- prefer safe real foundations over fake demo code
- maintain backward safety
- keep changelogs precise
- tests should validate changed scope, not replace implementation work

Current product priorities:

1. complete SaaS body
2. complete AI brain/control plane

Current high-priority body gaps:

- delivery execution depth
- connector runtime reliability
- HQ/franchise governance
- finance/FMS depth
- advanced call-center operations
- campaigns/growth execution maturity

Current AI-brain priorities:

- planner trigger governance
- policy DSL/simulation
- command-center backend/UI
- execution ledger/replayability
- deterministic fallback
- context freshness/provenance
