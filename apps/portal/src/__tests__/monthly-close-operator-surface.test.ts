import { describe, expect, test } from "vitest";
import {
  evaluateCloseReadiness,
  evaluateReopenReadiness,
  getCloseChecklistItems,
  getReopenChecklistItems,
  normalizeEvidenceDrafts,
  normalizeMonthlyCloseLedger,
} from "@/app/merchant/reports/monthly-close/page";

describe("monthly close operator surface helpers", () => {
  test("marks approval checklist item required when packet needs approval", () => {
    const items = getCloseChecklistItems({
      blockers: [
        {
          code: "open_register_sessions",
          severity: "critical",
          message: "critical blocker",
          value: 2,
        },
      ],
      requiresApproval: true,
    });

    const approvalItem = items.find(
      (item) => item.key === "approval-justified",
    );
    expect(approvalItem?.required).toBe(true);
  });

  test("rejects close submission when hash and checklist are incomplete", () => {
    const checklistItems = getCloseChecklistItems({
      blockers: [],
      requiresApproval: false,
    });

    const result = evaluateCloseReadiness({
      packetHash: "abc123",
      typedHash: "xyz999",
      checklistItems,
      checklistState: {
        "packet-reviewed": true,
      },
      requiresApproval: false,
      requiresSecondApproval: false,
      evidence: [],
      approval: {
        force: false,
        approvedBy: "",
        reason: "",
        secondApprovedBy: "",
        secondReason: "",
      },
    });

    expect(result.ready).toBe(false);
    expect(result.unmet.some((message) => message.includes("hash"))).toBe(true);
    expect(result.unmet.length).toBeGreaterThanOrEqual(1);
  });

  test("accepts close submission when hash checklist and approval are valid", () => {
    const checklistItems = getCloseChecklistItems({
      blockers: [],
      requiresApproval: true,
    });

    const checklistState: Record<string, boolean> = {};
    for (const item of checklistItems) {
      checklistState[item.key] = true;
    }

    const result = evaluateCloseReadiness({
      packetHash: "packet-hash-1",
      typedHash: "packet-hash-1",
      checklistItems,
      checklistState,
      requiresApproval: true,
      requiresSecondApproval: true,
      evidence: [
        {
          referenceId: "ev-1",
          category: "bank_statement",
          uri: "s3://proofs/bank-statement.pdf",
        },
      ],
      approval: {
        force: true,
        approvedBy: "finance-manager",
        reason: "manual override documented",
        secondApprovedBy: "finance-director",
        secondReason: "dual approval required by risk policy",
      },
    });

    expect(result.ready).toBe(true);
    expect(result.unmet).toEqual([]);
  });

  test("requires explicit approval and checklist for reopen", () => {
    const checklistItems = getReopenChecklistItems();

    const blocked = evaluateReopenReadiness({
      checklistItems,
      checklistState: {},
      evidence: [],
      approval: {
        force: false,
        approvedBy: "",
        reason: "short",
      },
    });

    expect(blocked.ready).toBe(false);
    expect(blocked.unmet.length).toBeGreaterThan(0);

    const checklistState: Record<string, boolean> = {};
    for (const item of checklistItems) {
      checklistState[item.key] = true;
    }

    const allowed = evaluateReopenReadiness({
      checklistItems,
      checklistState,
      evidence: [
        {
          referenceId: "ev-reopen-1",
          category: "adjustment_ticket",
          note: "approved correction package",
        },
      ],
      approval: {
        force: true,
        approvedBy: "finance-admin",
        reason: "reopen for reconciliation fix",
      },
    });

    expect(allowed.ready).toBe(true);
  });

  test("normalizes and sorts ledger rows by created_at desc", () => {
    const rows = normalizeMonthlyCloseLedger([
      {
        id: "1",
        action_type: "REOPEN",
        created_at: "2026-03-01T10:00:00.000Z",
        blockers: [],
      },
      {
        id: "2",
        action_type: "LOCK",
        created_at: "2026-03-02T10:00:00.000Z",
        blockers: [],
      },
      {
        id: "3",
        action_type: "INVALID",
        created_at: "2026-02-27T10:00:00.000Z",
        blockers: null,
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe("2");
    expect(rows[1].id).toBe("1");
    expect(rows[2].action_type).toBe("PACKET_GENERATED");
    expect(Array.isArray(rows[2].blockers)).toBe(true);
  });

  test("normalizes evidence drafts and drops invalid rows", () => {
    const evidence = normalizeEvidenceDrafts([
      {
        referenceId: "",
        category: "",
        uri: "",
        checksum: "",
        note: "",
      },
      {
        referenceId: "ev-2",
        category: "bank_statement",
        uri: "s3://evidence/statement.pdf",
        checksum: "",
        note: "",
      },
      {
        referenceId: "ev-1",
        category: "cod_recon",
        uri: "",
        checksum: "sha256:abc",
        note: "",
      },
    ]);

    expect(evidence).toHaveLength(2);
    expect(evidence[0].referenceId).toBe("ev-1");
    expect(evidence[1].referenceId).toBe("ev-2");
  });
});
