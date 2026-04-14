"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Fingerprint,
  History,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
  Unlock,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";

interface MonthlyCloseBlocker {
  code: string;
  severity: "critical" | "warning" | "info";
  message: string;
  value: number;
}

interface MonthlyCloseEvidenceReference {
  referenceId: string;
  category: string;
  uri?: string;
  checksum?: string;
  note?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

interface MonthlyClosePacket {
  packetId: string | null;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  packetHash: string;
  confidenceScore: number;
  requiresApproval: boolean;
  requiresSecondApproval: boolean;
  riskTier: "normal" | "high";
  riskReasons: string[];
  closeReady: boolean;
  blockers: MonthlyCloseBlocker[];
  metrics: Record<string, number>;
}

interface MonthlyCloseLedgerItem {
  id: string;
  close_id: string | null;
  packet_id: string | null;
  action_type: "PACKET_GENERATED" | "CLOSE" | "LOCK" | "REOPEN";
  snapshot_hash: string | null;
  confidence_score: number;
  blockers: MonthlyCloseBlocker[];
  requires_approval: boolean;
  approval_granted: boolean;
  approval_actor: string | null;
  approval_reason: string | null;
  acted_by: string | null;
  acted_role: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
}

interface CloseReadinessInput {
  packetHash: string;
  typedHash: string;
  checklistItems: ChecklistItem[];
  checklistState: Record<string, boolean>;
  requiresApproval: boolean;
  requiresSecondApproval: boolean;
  evidence: MonthlyCloseEvidenceReference[];
  approval: {
    force: boolean;
    approvedBy: string;
    reason: string;
    secondApprovedBy: string;
    secondReason: string;
  };
}

interface ReopenReadinessInput {
  checklistItems: ChecklistItem[];
  checklistState: Record<string, boolean>;
  evidence: MonthlyCloseEvidenceReference[];
  approval: {
    force: boolean;
    approvedBy: string;
    reason: string;
  };
}

interface EvidenceDraft {
  referenceId: string;
  category: string;
  uri: string;
  checksum: string;
  note: string;
}

export function getCloseChecklistItems(packet?: {
  blockers?: MonthlyCloseBlocker[];
  requiresApproval?: boolean;
}): ChecklistItem[] {
  const hasBlockers =
    Array.isArray(packet?.blockers) && packet!.blockers!.length > 0;
  const requiresApproval = packet?.requiresApproval === true;

  return [
    {
      key: "packet-reviewed",
      label: "تمت مراجعة الباكت الشهري والأرقام الرئيسية",
      required: true,
    },
    {
      key: "blockers-reviewed",
      label: hasBlockers
        ? "تمت مراجعة كل المعيقات وتوثيق المعالجة"
        : "لا توجد معيقات حرجة للفترة المختارة",
      required: true,
    },
    {
      key: "evidence-attached",
      label: "تم إرفاق أدلة الإقفال (مستندات/تقارير/مراجع)",
      required: true,
    },
    {
      key: "approval-justified",
      label: "تم توثيق سبب الموافقة الاستثنائية",
      required: requiresApproval,
    },
  ];
}

export function getReopenChecklistItems(): ChecklistItem[] {
  return [
    {
      key: "reopen-impact-reviewed",
      label: "تمت مراجعة أثر إعادة الفتح على التقارير المالية",
      required: true,
    },
    {
      key: "reopen-evidence-attached",
      label: "تم إرفاق أدلة سبب إعادة الفتح",
      required: true,
    },
  ];
}

export function buildEmptyEvidenceDraft(
  prefix: string,
  index: number,
): EvidenceDraft {
  return {
    referenceId: `${prefix}-${index}`,
    category: "",
    uri: "",
    checksum: "",
    note: "",
  };
}

export function normalizeEvidenceDrafts(
  drafts: EvidenceDraft[],
): MonthlyCloseEvidenceReference[] {
  if (!Array.isArray(drafts)) return [];

  return drafts
    .map((draft, index) => {
      const referenceId = String(draft.referenceId || "").trim();
      const category = String(draft.category || "")
        .trim()
        .toLowerCase();
      const uri = String(draft.uri || "").trim();
      const checksum = String(draft.checksum || "").trim();
      const note = String(draft.note || "").trim();

      if (!category) return null;
      if (!uri && !checksum && !note) return null;

      return {
        referenceId: referenceId || `evidence-${index + 1}`,
        category,
        uri: uri || undefined,
        checksum: checksum || undefined,
        note: note || undefined,
      } as MonthlyCloseEvidenceReference;
    })
    .filter((item): item is MonthlyCloseEvidenceReference => item !== null)
    .sort((a, b) => a.referenceId.localeCompare(b.referenceId));
}

export function evaluateCloseReadiness(input: CloseReadinessInput): {
  ready: boolean;
  unmet: string[];
} {
  const unmet: string[] = [];
  const expectedHash = String(input.packetHash || "")
    .trim()
    .toLowerCase();
  const typedHash = String(input.typedHash || "")
    .trim()
    .toLowerCase();

  if (!expectedHash) {
    unmet.push("لا يوجد packet hash صالح للإقفال");
  }

  if (!typedHash || typedHash !== expectedHash) {
    unmet.push("تأكيد packet hash غير مطابق");
  }

  for (const item of input.checklistItems) {
    if (item.required && input.checklistState[item.key] !== true) {
      unmet.push(item.label);
    }
  }

  if (!input.evidence.length) {
    unmet.push("يجب إدخال مرجع دليل واحد على الأقل للإقفال");
  }

  if (input.requiresApproval) {
    if (input.approval.force !== true) {
      unmet.push("تفعيل الموافقة الصريحة مطلوب للإقفال");
    }
    if (String(input.approval.approvedBy || "").trim().length === 0) {
      unmet.push("اسم صاحب الموافقة مطلوب");
    }
    if (String(input.approval.reason || "").trim().length < 8) {
      unmet.push("سبب الموافقة يجب ألا يقل عن 8 أحرف");
    }
  }

  if (input.requiresSecondApproval) {
    if (String(input.approval.secondApprovedBy || "").trim().length === 0) {
      unmet.push("اسم صاحب الموافقة الثانية مطلوب");
    }
    if (String(input.approval.secondReason || "").trim().length < 8) {
      unmet.push("سبب الموافقة الثانية يجب ألا يقل عن 8 أحرف");
    }

    const normalizedPrimary = String(input.approval.approvedBy || "")
      .trim()
      .toLowerCase();
    const normalizedSecondary = String(input.approval.secondApprovedBy || "")
      .trim()
      .toLowerCase();
    if (
      normalizedPrimary.length > 0 &&
      normalizedSecondary.length > 0 &&
      normalizedPrimary === normalizedSecondary
    ) {
      unmet.push("الموافقة الثانية يجب أن تكون من معتمد مختلف");
    }
  }

  return {
    ready: unmet.length === 0,
    unmet,
  };
}

export function evaluateReopenReadiness(input: ReopenReadinessInput): {
  ready: boolean;
  unmet: string[];
} {
  const unmet: string[] = [];

  for (const item of input.checklistItems) {
    if (item.required && input.checklistState[item.key] !== true) {
      unmet.push(item.label);
    }
  }

  if (!input.evidence.length) {
    unmet.push("يجب إدخال مرجع دليل واحد على الأقل لإعادة الفتح");
  }

  if (input.approval.force !== true) {
    unmet.push("تفعيل الموافقة الصريحة مطلوب لإعادة الفتح");
  }
  if (String(input.approval.approvedBy || "").trim().length === 0) {
    unmet.push("اسم صاحب الموافقة مطلوب");
  }
  if (String(input.approval.reason || "").trim().length < 8) {
    unmet.push("سبب إعادة الفتح يجب ألا يقل عن 8 أحرف");
  }

  return {
    ready: unmet.length === 0,
    unmet,
  };
}

export function normalizeMonthlyCloseLedger(
  items: unknown,
): MonthlyCloseLedgerItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((raw) => {
      const item = (raw || {}) as Record<string, unknown>;
      const actionTypeRaw = String(item.action_type || "PACKET_GENERATED");
      const actionType =
        actionTypeRaw === "CLOSE" ||
        actionTypeRaw === "LOCK" ||
        actionTypeRaw === "REOPEN"
          ? actionTypeRaw
          : "PACKET_GENERATED";

      const createdAt = String(item.created_at || new Date().toISOString());
      const blockers = Array.isArray(item.blockers)
        ? (item.blockers as MonthlyCloseBlocker[])
        : [];

      return {
        id: String(item.id || `${actionType}-${createdAt}`),
        close_id: item.close_id ? String(item.close_id) : null,
        packet_id: item.packet_id ? String(item.packet_id) : null,
        action_type: actionType,
        snapshot_hash: item.snapshot_hash ? String(item.snapshot_hash) : null,
        confidence_score: Number(item.confidence_score || 0),
        blockers,
        requires_approval: item.requires_approval === true,
        approval_granted: item.approval_granted === true,
        approval_actor: item.approval_actor
          ? String(item.approval_actor)
          : null,
        approval_reason: item.approval_reason
          ? String(item.approval_reason)
          : null,
        acted_by: item.acted_by ? String(item.acted_by) : null,
        acted_role: item.acted_role ? String(item.acted_role) : null,
        metadata:
          item.metadata && typeof item.metadata === "object"
            ? (item.metadata as Record<string, unknown>)
            : {},
        created_at: createdAt,
      } as MonthlyCloseLedgerItem;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

const MONTH_OPTIONS = [
  { value: 1, label: "يناير" },
  { value: 2, label: "فبراير" },
  { value: 3, label: "مارس" },
  { value: 4, label: "أبريل" },
  { value: 5, label: "مايو" },
  { value: 6, label: "يونيو" },
  { value: 7, label: "يوليو" },
  { value: 8, label: "أغسطس" },
  { value: 9, label: "سبتمبر" },
  { value: 10, label: "أكتوبر" },
  { value: 11, label: "نوفمبر" },
  { value: 12, label: "ديسمبر" },
];

function getActionBadge(actionType: MonthlyCloseLedgerItem["action_type"]) {
  if (actionType === "CLOSE") {
    return {
      label: "إقفال",
      className:
        "border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]",
    };
  }
  if (actionType === "LOCK") {
    return {
      label: "قفل",
      className:
        "border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 text-[var(--accent-success)]",
    };
  }
  if (actionType === "REOPEN") {
    return {
      label: "إعادة فتح",
      className:
        "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]",
    };
  }
  return {
    label: "توليد باكت",
    className:
      "border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]",
  };
}

function getConfidenceTone(score: number) {
  if (score >= 92) {
    return {
      label: "جاهز",
      className:
        "border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 text-[var(--accent-success)]",
    };
  }
  if (score >= 75) {
    return {
      label: "متوسط",
      className:
        "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]",
    };
  }
  return {
    label: "منخفض",
    className:
      "border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
  };
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractLedgerEvidence(
  metadata: Record<string, unknown>,
): MonthlyCloseEvidenceReference[] {
  const raw = metadata?.evidence;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const referenceId = String(row.referenceId || "").trim();
      const category = String(row.category || "").trim();
      if (!referenceId || !category) return null;

      return {
        referenceId,
        category,
        uri: row.uri ? String(row.uri) : undefined,
        checksum: row.checksum ? String(row.checksum) : undefined,
        note: row.note ? String(row.note) : undefined,
        uploadedBy: row.uploadedBy ? String(row.uploadedBy) : undefined,
        uploadedAt: row.uploadedAt ? String(row.uploadedAt) : undefined,
      } as MonthlyCloseEvidenceReference;
    })
    .filter((item): item is MonthlyCloseEvidenceReference => item !== null);
}

function extractLedgerSecondApproval(metadata: Record<string, unknown>): {
  granted: boolean;
  approvedBy: string | null;
  reason: string | null;
} {
  const raw = metadata?.secondApproval;
  if (!raw || typeof raw !== "object") {
    return {
      granted: false,
      approvedBy: null,
      reason: null,
    };
  }

  const row = raw as Record<string, unknown>;
  return {
    granted: row.granted === true,
    approvedBy: row.approvedBy ? String(row.approvedBy) : null,
    reason: row.reason ? String(row.reason) : null,
  };
}

export default function MonthlyCloseOperatorPage() {
  const { merchantId, apiKey } = useMerchant();

  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [year, setYear] = useState<number>(previousMonth.getFullYear());
  const [month, setMonth] = useState<number>(previousMonth.getMonth() + 1);

  const [packet, setPacket] = useState<MonthlyClosePacket | null>(null);
  const [ledger, setLedger] = useState<MonthlyCloseLedgerItem[]>([]);

  const [loadingPacket, setLoadingPacket] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [submittingClose, setSubmittingClose] = useState(false);
  const [submittingReopen, setSubmittingReopen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [hashConfirmation, setHashConfirmation] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [lockAfterClose, setLockAfterClose] = useState(true);
  const [closeApproval, setCloseApproval] = useState({
    force: false,
    approvedBy: "",
    reason: "",
    secondApprovedBy: "",
    secondReason: "",
  });

  const [reopenNotes, setReopenNotes] = useState("");
  const [reopenApproval, setReopenApproval] = useState({
    force: false,
    approvedBy: "",
    reason: "",
  });

  const [closeEvidenceDrafts, setCloseEvidenceDrafts] = useState<
    EvidenceDraft[]
  >([buildEmptyEvidenceDraft("close", 1)]);
  const [reopenEvidenceDrafts, setReopenEvidenceDrafts] = useState<
    EvidenceDraft[]
  >([buildEmptyEvidenceDraft("reopen", 1)]);

  const [closeChecklist, setCloseChecklist] = useState<Record<string, boolean>>(
    {},
  );
  const [reopenChecklist, setReopenChecklist] = useState<
    Record<string, boolean>
  >({});

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  }, [now]);

  const closeChecklistItems = useMemo(
    () => getCloseChecklistItems(packet || undefined),
    [packet],
  );
  const reopenChecklistItems = useMemo(() => getReopenChecklistItems(), []);
  const closeEvidence = useMemo(
    () => normalizeEvidenceDrafts(closeEvidenceDrafts),
    [closeEvidenceDrafts],
  );
  const reopenEvidence = useMemo(
    () => normalizeEvidenceDrafts(reopenEvidenceDrafts),
    [reopenEvidenceDrafts],
  );

  const closeReadiness = useMemo(
    () =>
      evaluateCloseReadiness({
        packetHash: packet?.packetHash || "",
        typedHash: hashConfirmation,
        checklistItems: closeChecklistItems,
        checklistState: closeChecklist,
        requiresApproval: packet?.requiresApproval === true,
        requiresSecondApproval: packet?.requiresSecondApproval === true,
        evidence: closeEvidence,
        approval: closeApproval,
      }),
    [
      packet,
      hashConfirmation,
      closeChecklistItems,
      closeChecklist,
      closeEvidence,
      closeApproval,
    ],
  );

  const reopenReadiness = useMemo(
    () =>
      evaluateReopenReadiness({
        checklistItems: reopenChecklistItems,
        checklistState: reopenChecklist,
        evidence: reopenEvidence,
        approval: reopenApproval,
      }),
    [reopenChecklistItems, reopenChecklist, reopenEvidence, reopenApproval],
  );

  const loadPacket = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    setLoadingPacket(true);
    setError(null);
    try {
      const response = await portalApi.getMonthlyClosePacket(year, month);
      setPacket(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "فشل تحميل باكت الإقفال الشهري",
      );
    } finally {
      setLoadingPacket(false);
    }
  }, [merchantId, apiKey, year, month]);

  const loadLedger = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    setLoadingLedger(true);
    setError(null);
    try {
      const response = await portalApi.getMonthlyCloseLedger(year, month, {
        limit: 100,
        offset: 0,
      });
      setLedger(normalizeMonthlyCloseLedger(response.items));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "فشل تحميل سجل الإقفال الشهري",
      );
    } finally {
      setLoadingLedger(false);
    }
  }, [merchantId, apiKey, year, month]);

  useEffect(() => {
    if (!merchantId || !apiKey) return;
    loadPacket();
    loadLedger();
  }, [merchantId, apiKey, loadPacket, loadLedger]);

  const handleRefreshAll = useCallback(async () => {
    setSuccessMessage(null);
    await Promise.all([loadPacket(), loadLedger()]);
  }, [loadPacket, loadLedger]);

  const addCloseEvidenceDraft = useCallback(() => {
    setCloseEvidenceDrafts((previous) => [
      ...previous,
      buildEmptyEvidenceDraft("close", previous.length + 1),
    ]);
  }, []);

  const addReopenEvidenceDraft = useCallback(() => {
    setReopenEvidenceDrafts((previous) => [
      ...previous,
      buildEmptyEvidenceDraft("reopen", previous.length + 1),
    ]);
  }, []);

  const updateEvidenceDraft = useCallback(
    (
      mode: "close" | "reopen",
      index: number,
      key: keyof EvidenceDraft,
      value: string,
    ) => {
      const updater = (rows: EvidenceDraft[]) =>
        rows.map((row, rowIndex) =>
          rowIndex === index
            ? {
                ...row,
                [key]: value,
              }
            : row,
        );

      if (mode === "close") {
        setCloseEvidenceDrafts(updater);
      } else {
        setReopenEvidenceDrafts(updater);
      }
    },
    [],
  );

  const removeEvidenceDraft = useCallback(
    (mode: "close" | "reopen", index: number) => {
      const remover = (rows: EvidenceDraft[], prefix: "close" | "reopen") => {
        const filtered = rows.filter((_, rowIndex) => rowIndex !== index);
        if (filtered.length > 0) {
          return filtered;
        }
        return [buildEmptyEvidenceDraft(prefix, 1)];
      };

      if (mode === "close") {
        setCloseEvidenceDrafts((previous) => remover(previous, "close"));
      } else {
        setReopenEvidenceDrafts((previous) => remover(previous, "reopen"));
      }
    },
    [],
  );

  const handleCloseSubmit = useCallback(async () => {
    if (!packet || !closeReadiness.ready) return;

    setSubmittingClose(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await portalApi.closeMonthlyClosePeriod(year, month, {
        packetHash: packet.packetHash,
        lockAfterClose,
        notes: closeNotes || undefined,
        approval:
          closeApproval.force ||
          packet.requiresApproval ||
          packet.requiresSecondApproval
            ? {
                force: closeApproval.force,
                approvedBy: closeApproval.approvedBy,
                reason: closeApproval.reason,
                secondApprovedBy: closeApproval.secondApprovedBy,
                secondReason: closeApproval.secondReason,
              }
            : undefined,
        evidence: closeEvidence,
      });

      setSuccessMessage(
        `تم تنفيذ الإقفال بنجاح. الحالة الحالية: ${result.status}`,
      );
      await Promise.all([loadPacket(), loadLedger()]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "فشل تنفيذ الإقفال",
      );
    } finally {
      setSubmittingClose(false);
    }
  }, [
    packet,
    closeReadiness.ready,
    year,
    month,
    lockAfterClose,
    closeNotes,
    closeEvidence,
    closeApproval,
    loadPacket,
    loadLedger,
  ]);

  const handleReopenSubmit = useCallback(async () => {
    if (!reopenReadiness.ready) return;

    setSubmittingReopen(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await portalApi.reopenMonthlyClosePeriod(year, month, {
        notes: reopenNotes || undefined,
        approval: {
          force: reopenApproval.force,
          approvedBy: reopenApproval.approvedBy,
          reason: reopenApproval.reason,
        },
        evidence: reopenEvidence,
      });

      setSuccessMessage(
        `تمت إعادة الفتح بنجاح. الحالة الحالية: ${result.status}`,
      );
      await Promise.all([loadPacket(), loadLedger()]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "فشل تنفيذ إعادة الفتح",
      );
    } finally {
      setSubmittingReopen(false);
    }
  }, [
    reopenReadiness.ready,
    year,
    month,
    reopenNotes,
    reopenEvidence,
    reopenApproval,
    loadPacket,
    loadLedger,
  ]);

  const confidenceTone = getConfidenceTone(packet?.confidenceScore || 0);
  const metrics = packet?.metrics || {};

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="تشغيل الإقفال الشهري"
        description="مراجعة الباكت، التحقق من الثقة والمعيقات، تأكيد الهاش، ثم إقفال/إعادة فتح مع سجل حوكمة غير قابل للتعديل."
        actions={
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={loadingPacket || loadingLedger}
            className="w-full sm:w-auto"
          >
            {loadingPacket || loadingLedger ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            تحديث
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>اختيار فترة الإقفال</CardTitle>
          <CardDescription>
            اختر السنة والشهر لتوليد باكت الإقفال وعرض سجل الحوكمة.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>السنة</Label>
            <Select
              value={String(year)}
              onValueChange={(value) => setYear(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الشهر</Label>
            <Select
              value={String(month)}
              onValueChange={(value) => setMonth(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={handleRefreshAll}
              disabled={loadingPacket || loadingLedger}
            >
              إعادة تحميل الفترة
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/10">
          <CardContent className="py-4 text-sm text-[var(--accent-danger)]">
            {error}
          </CardContent>
        </Card>
      )}

      {successMessage && (
        <Card className="border-[var(--accent-success)]/25 bg-[var(--accent-success)]/10">
          <CardContent className="py-4 text-sm text-[var(--accent-success)]">
            {successMessage}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            مراجعة الباكت والثقة
          </CardTitle>
          <CardDescription>
            هذا هو المصدر المعتمد قبل أي إقفال. لا يتم الإقفال إلا على نفس
            الهاش.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingPacket ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جار تحميل باكت الإقفال...
            </div>
          ) : packet ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">معرّف الباكت</p>
                  <p className="font-mono text-xs break-all">
                    {packet.packetId || "غير متاح"}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">هاش الباكت</p>
                  <p className="font-mono text-xs break-all">
                    {packet.packetHash}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">بداية الفترة</p>
                  <p className="text-sm">
                    {formatDateTime(packet.periodStart)}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">نهاية الفترة</p>
                  <p className="text-sm">{formatDateTime(packet.periodEnd)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">درجة الثقة</p>
                  <Badge className={confidenceTone.className}>
                    {packet.confidenceScore}% - {confidenceTone.label}
                  </Badge>
                </div>
                <Progress value={packet.confidenceScore} className="h-2" />
                {packet.requiresApproval ? (
                  <p className="text-xs text-[var(--accent-warning)]">
                    تتطلب الفترة موافقة صريحة بسبب معيقات حرجة أو انخفاض الثقة.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--accent-success)]">
                    لا توجد حاجة لموافقة استثنائية لهذه الفترة.
                  </p>
                )}
                {packet.requiresSecondApproval ? (
                  <p className="text-xs text-[var(--accent-danger)]">
                    الفترة عالية المخاطر: يلزم معتمد ثانٍ مستقل قبل الإقفال.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--accent-blue)]">
                    لا يلزم معتمد ثانٍ مستقل لهذه الفترة.
                  </p>
                )}
                {packet.riskReasons.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {packet.riskReasons.map((reason) => (
                      <Badge key={reason} variant="outline">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              لا يوجد باكت متاح حالياً.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              المعيقات
            </CardTitle>
            <CardDescription>
              مراجعة كل المعيقات قبل اعتماد الإقفال.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {packet?.blockers?.length ? (
              packet.blockers.map((blocker, index) => {
                const toneClass =
                  blocker.severity === "critical"
                    ? "border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/10"
                    : blocker.severity === "warning"
                      ? "border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/10"
                      : "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/10";
                return (
                  <div
                    key={`${blocker.code}-${index}`}
                    className={`rounded-lg border p-3 ${toneClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{blocker.message}</p>
                      <Badge variant="outline">{blocker.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      الكود: {blocker.code} | القيمة: {String(blocker.value)}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/10 p-3 text-sm text-[var(--accent-success)]">
                لا توجد معيقات للفترة المحددة.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>مؤشرات الإقفال</CardTitle>
            <CardDescription>
              عرض موجز لمؤشرات الفترة المستخدمة داخل الباكت.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">الإيراد المحقق</p>
              <p className="text-lg font-semibold">
                {formatCurrency(Number(metrics.realizedRevenue || 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
              <p className="text-lg font-semibold">
                {formatCurrency(Number(metrics.totalExpenses || 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
              <p className="text-lg font-semibold">
                {Number(metrics.totalOrders || 0).toLocaleString("ar-EG")}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                صافي التدفق النقدي
              </p>
              <p className="text-lg font-semibold">
                {formatCurrency(Number(metrics.netCashFlow || 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">COD غير محصل</p>
              <p className="text-lg font-semibold">
                {formatCurrency(Number(metrics.codOutstanding || 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                جلسات كاشير مفتوحة
              </p>
              <p className="text-lg font-semibold">
                {Number(metrics.openRegisterSessions || 0).toLocaleString(
                  "ar-EG",
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              تنفيذ الإقفال
            </CardTitle>
            <CardDescription>
              مطلوب: تأكيد الهاش + Checklist الأدلة + (موافقة صريحة عند الحاجة).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>تأكيد Packet Hash</Label>
              <Input
                value={hashConfirmation}
                onChange={(event) => setHashConfirmation(event.target.value)}
                placeholder="الصق نفس الهاش الموجود في الباكت"
              />
              {packet?.packetHash ? (
                hashConfirmation.trim().toLowerCase() ===
                packet.packetHash.trim().toLowerCase() ? (
                  <p className="text-xs text-[var(--accent-success)]">
                    الهاش مطابق ويمكن المتابعة.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--accent-warning)]">
                    الهاش غير مطابق بعد.
                  </p>
                )
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Evidence Checklist قبل الإقفال
              </p>
              {closeChecklistItems.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-start gap-2"
                >
                  <Checkbox
                    checked={closeChecklist[item.key] === true}
                    onCheckedChange={(checked) =>
                      setCloseChecklist((previous) => ({
                        ...previous,
                        [item.key]: checked === true,
                      }))
                    }
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={lockAfterClose}
                  onCheckedChange={(checked) =>
                    setLockAfterClose(checked === true)
                  }
                />
                قفل الشهر مباشرة بعد الإقفال
              </label>
              <Input
                value={closeNotes}
                onChange={(event) => setCloseNotes(event.target.value)}
                placeholder="ملاحظات الإقفال (اختياري)"
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">بيانات الموافقة الصريحة</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={closeApproval.force}
                  onCheckedChange={(checked) =>
                    setCloseApproval((previous) => ({
                      ...previous,
                      force: checked === true,
                    }))
                  }
                />
                تفعيل الموافقة الصريحة
              </label>
              <Input
                value={closeApproval.approvedBy}
                onChange={(event) =>
                  setCloseApproval((previous) => ({
                    ...previous,
                    approvedBy: event.target.value,
                  }))
                }
                placeholder="اسم المعتمد"
              />
              <Input
                value={closeApproval.reason}
                onChange={(event) =>
                  setCloseApproval((previous) => ({
                    ...previous,
                    reason: event.target.value,
                  }))
                }
                placeholder="سبب الموافقة"
              />
              {packet?.requiresSecondApproval && (
                <>
                  <Input
                    value={closeApproval.secondApprovedBy}
                    onChange={(event) =>
                      setCloseApproval((previous) => ({
                        ...previous,
                        secondApprovedBy: event.target.value,
                      }))
                    }
                    placeholder="اسم المعتمد الثاني (إلزامي للمخاطر العالية)"
                  />
                  <Input
                    value={closeApproval.secondReason}
                    onChange={(event) =>
                      setCloseApproval((previous) => ({
                        ...previous,
                        secondReason: event.target.value,
                      }))
                    }
                    placeholder="سبب الموافقة الثانية"
                  />
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  مراجع الأدلة المرفقة للإقفال
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCloseEvidenceDraft}
                >
                  <Plus className="h-4 w-4" />
                  إضافة دليل
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                يجب إدخال مرجع واحد صالح على الأقل (مع فئة + رابط/هاش/ملاحظة).
              </p>

              {closeEvidenceDrafts.map((draft, index) => (
                <div
                  key={`close-evidence-${index}`}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      value={draft.referenceId}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "close",
                          index,
                          "referenceId",
                          event.target.value,
                        )
                      }
                      placeholder="referenceId"
                    />
                    <Input
                      value={draft.category}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "close",
                          index,
                          "category",
                          event.target.value,
                        )
                      }
                      placeholder="category (bank_statement, cod_recon, ...)"
                    />
                    <Input
                      value={draft.uri}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "close",
                          index,
                          "uri",
                          event.target.value,
                        )
                      }
                      placeholder="uri (s3://, https://, file key)"
                    />
                    <Input
                      value={draft.checksum}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "close",
                          index,
                          "checksum",
                          event.target.value,
                        )
                      }
                      placeholder="checksum (optional)"
                    />
                  </div>
                  <Input
                    value={draft.note}
                    onChange={(event) =>
                      updateEvidenceDraft(
                        "close",
                        index,
                        "note",
                        event.target.value,
                      )
                    }
                    placeholder="ملاحظة الدليل"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEvidenceDraft("close", index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                مراجع أدلة صالحة حالياً: {closeEvidence.length}
              </div>
            </div>

            {closeReadiness.unmet.length > 0 && (
              <div className="rounded-lg border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/10 p-3 text-xs text-[var(--accent-warning)]">
                <p className="mb-1 font-medium">متطلبات غير مكتملة:</p>
                <ul className="list-disc pr-4 space-y-1">
                  {closeReadiness.unmet.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full"
              disabled={
                submittingClose ||
                !packet ||
                !closeReadiness.ready ||
                loadingPacket
              }
              onClick={handleCloseSubmit}
            >
              {submittingClose ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              تنفيذ الإقفال
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" />
              إعادة فتح الشهر
            </CardTitle>
            <CardDescription>
              إعادة الفتح تتطلب موافقة صريحة + Checklist أدلة مستقل.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Evidence Checklist قبل إعادة الفتح
              </p>
              {reopenChecklistItems.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-start gap-2"
                >
                  <Checkbox
                    checked={reopenChecklist[item.key] === true}
                    onCheckedChange={(checked) =>
                      setReopenChecklist((previous) => ({
                        ...previous,
                        [item.key]: checked === true,
                      }))
                    }
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={reopenApproval.force}
                  onCheckedChange={(checked) =>
                    setReopenApproval((previous) => ({
                      ...previous,
                      force: checked === true,
                    }))
                  }
                />
                تفعيل موافقة إعادة الفتح
              </label>
              <Input
                value={reopenApproval.approvedBy}
                onChange={(event) =>
                  setReopenApproval((previous) => ({
                    ...previous,
                    approvedBy: event.target.value,
                  }))
                }
                placeholder="اسم المعتمد"
              />
              <Input
                value={reopenApproval.reason}
                onChange={(event) =>
                  setReopenApproval((previous) => ({
                    ...previous,
                    reason: event.target.value,
                  }))
                }
                placeholder="سبب إعادة الفتح"
              />
              <Input
                value={reopenNotes}
                onChange={(event) => setReopenNotes(event.target.value)}
                placeholder="ملاحظات إضافية (اختياري)"
              />
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  مراجع الأدلة المرفقة لإعادة الفتح
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addReopenEvidenceDraft}
                >
                  <Plus className="h-4 w-4" />
                  إضافة دليل
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                يجب إدخال مرجع واحد صالح على الأقل لإعادة الفتح.
              </p>

              {reopenEvidenceDrafts.map((draft, index) => (
                <div
                  key={`reopen-evidence-${index}`}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      value={draft.referenceId}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "reopen",
                          index,
                          "referenceId",
                          event.target.value,
                        )
                      }
                      placeholder="referenceId"
                    />
                    <Input
                      value={draft.category}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "reopen",
                          index,
                          "category",
                          event.target.value,
                        )
                      }
                      placeholder="category"
                    />
                    <Input
                      value={draft.uri}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "reopen",
                          index,
                          "uri",
                          event.target.value,
                        )
                      }
                      placeholder="uri"
                    />
                    <Input
                      value={draft.checksum}
                      onChange={(event) =>
                        updateEvidenceDraft(
                          "reopen",
                          index,
                          "checksum",
                          event.target.value,
                        )
                      }
                      placeholder="checksum (optional)"
                    />
                  </div>
                  <Input
                    value={draft.note}
                    onChange={(event) =>
                      updateEvidenceDraft(
                        "reopen",
                        index,
                        "note",
                        event.target.value,
                      )
                    }
                    placeholder="ملاحظة الدليل"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEvidenceDraft("reopen", index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                مراجع أدلة صالحة حالياً: {reopenEvidence.length}
              </div>
            </div>

            {reopenReadiness.unmet.length > 0 && (
              <div className="rounded-lg border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/10 p-3 text-xs text-[var(--accent-warning)]">
                <p className="mb-1 font-medium">متطلبات غير مكتملة:</p>
                <ul className="list-disc pr-4 space-y-1">
                  {reopenReadiness.unmet.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              disabled={submittingReopen || !reopenReadiness.ready}
              onClick={handleReopenSubmit}
            >
              {submittingReopen ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldX className="h-4 w-4" />
              )}
              تنفيذ إعادة الفتح
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            السجل غير القابل للتعديل
          </CardTitle>
          <CardDescription>
            Timeline لحوكمة الإقفال الشهري (append-only immutable ledger).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingLedger ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جار تحميل السجل...
            </div>
          ) : ledger.length > 0 ? (
            ledger.map((item) => {
              const actionBadge = getActionBadge(item.action_type);
              const evidenceRefs = extractLedgerEvidence(item.metadata);
              const secondApproval = extractLedgerSecondApproval(item.metadata);
              return (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className={actionBadge.className}>
                        {actionBadge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <Badge variant="outline">
                      ثقة {Math.max(0, Math.round(item.confidence_score || 0))}%
                    </Badge>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>
                      المنفّذ: {item.acted_by || "-"} ({item.acted_role || "-"})
                    </p>
                    <p>
                      الموافقة:{" "}
                      {item.approval_granted ? "ممنوحة" : "غير ممنوحة"}
                    </p>
                    <p>صاحب الموافقة: {item.approval_actor || "-"}</p>
                    <p>
                      requiresApproval: {item.requires_approval ? "نعم" : "لا"}
                    </p>
                    <p>
                      موافقة ثانية:{" "}
                      {secondApproval.granted
                        ? "ممنوحة"
                        : "غير مطلوبة/غير ممنوحة"}
                    </p>
                    <p>معتمد ثانٍ: {secondApproval.approvedBy || "-"}</p>
                  </div>

                  {secondApproval.reason && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      سبب الموافقة الثانية: {secondApproval.reason}
                    </p>
                  )}

                  {item.snapshot_hash && (
                    <p className="mt-2 font-mono text-xs break-all">
                      hash: {item.snapshot_hash}
                    </p>
                  )}

                  {item.blockers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.blockers.map((blocker, idx) => (
                        <Badge key={`${item.id}-${idx}`} variant="outline">
                          {blocker.code}: {String(blocker.value)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 rounded-lg border border-dashed p-2">
                    <p className="text-xs font-medium">أدلة مرتبطة</p>
                    {evidenceRefs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {evidenceRefs.map((evidence) => (
                          <div
                            key={`${item.id}-${evidence.referenceId}`}
                            className="text-xs text-muted-foreground"
                          >
                            <p>
                              {evidence.referenceId} | {evidence.category}
                            </p>
                            {(evidence.uri || evidence.checksum) && (
                              <p className="break-all">
                                {evidence.uri || "-"}
                                {evidence.checksum
                                  ? ` | ${evidence.checksum}`
                                  : ""}
                              </p>
                            )}
                            {evidence.note && <p>{evidence.note}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        لا توجد أدلة محفوظة مع هذا الحدث.
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              لا توجد إدخالات في السجل لهذه الفترة.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10">
        <CardContent className="py-4 text-xs text-[var(--accent-blue)]">
          التشغيل الآمن: لا ترسل أي إقفال أو إعادة فتح إلا بعد اكتمال Checklist
          الأدلة وتطابق packet hash. الفترات عالية المخاطر تتطلب معتمدين
          مختلفين. كل إجراء يسجل أدلته داخل ledger immutable.
        </CardContent>
      </Card>
    </div>
  );
}
