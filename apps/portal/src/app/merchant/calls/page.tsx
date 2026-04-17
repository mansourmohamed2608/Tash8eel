"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  PhoneCall,
  Plus,
  Search,
  RefreshCw,
  ShoppingCart,
  Trash2,
  User,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { formatCurrency } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { RealTimeEvent, useWebSocketEvent } from "@/hooks/use-websocket";

interface VoiceTranscriptTurn {
  speaker: string;
  text: string;
  at?: string;
}

interface VoiceCallRecord {
  id: string;
  customerPhone: string;
  callSid: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  handledBy: string;
  status: string;
  transcript: VoiceTranscriptTurn[];
  orderId?: string | null;
  orderNumber?: string | null;
  recordingUrl?: string | null;
}

interface VoiceCallStats {
  periodDays: number;
  callsToday: number;
  aiHandled: number;
  staffHandled: number;
  missedCalls: number;
  ordersFromCalls: number;
}

interface FollowUpQueueEntry {
  callId: string;
  callSid?: string;
  customerPhone: string;
  priority: "high" | "medium" | "low";
  ageMinutes: number;
  missedAttempts: number;
  requiresRecovery: boolean;
  workflowState: "OPEN" | "CLAIMED" | "ASSIGNED" | "RESOLVED";
  claimedBy?: string | null;
  assignedTo?: string | null;
  disposition?:
    | "ORDER_CREATED"
    | "CALLBACK_REQUESTED"
    | "NO_ANSWER"
    | "NOT_INTERESTED"
    | "ESCALATED"
    | null;
  callbackDueAt?: string | null;
  workflowUpdatedAt?: string | null;
}

interface AgentPerformanceEntry {
  handledBy: string;
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
  ordersFromCalls: number;
  completionRatePct: number;
  conversionRatePct: number;
}

interface CallQueueHealth {
  pressureScore: number;
  healthState: "stable" | "elevated" | "critical";
  activeLive: number;
  callVolumeTrendPct: number;
  serviceLevelPct: number;
  missedRatePct: number;
}

interface ActiveCallPayload {
  callSid?: string;
  customerPhone?: string;
  handledBy?: string;
  status?: string;
  durationSeconds?: number;
  orderId?: string;
}

interface ManualOrderItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  unitPrice: number;
  isAvailable: boolean;
}

const defaultStats: VoiceCallStats = {
  periodDays: 1,
  callsToday: 0,
  aiHandled: 0,
  staffHandled: 0,
  missedCalls: 0,
  ordersFromCalls: 0,
};

const defaultQueueHealth: CallQueueHealth = {
  pressureScore: 0,
  healthState: "stable",
  activeLive: 0,
  callVolumeTrendPct: 0,
  serviceLevelPct: 0,
  missedRatePct: 0,
};

type CallsViewFilter =
  | "all"
  | "missed"
  | "without-order"
  | "with-order"
  | "ai"
  | "staff";

const missedCallStatuses = new Set([
  "missed",
  "no_answer",
  "failed",
  "busy",
  "cancelled",
  "canceled",
]);
const activeCallStatuses = new Set([
  "active",
  "ringing",
  "in_progress",
  "queued",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

const asOptionalString = (value: unknown) => {
  const normalized = asString(value, "");
  return normalized.length > 0 ? normalized : null;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asIsoDate = (value: unknown) => {
  const raw = asString(value, "");
  if (!raw) return "";
  const epoch = new Date(raw).getTime();
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : "";
};

const isMissedStatus = (status: string) => missedCallStatuses.has(status);

const isActiveStatus = (status: string) => activeCallStatuses.has(status);

function getStatusMeta(status: string) {
  if (isMissedStatus(status)) {
    return {
      label: "مكالمة فائتة",
      className:
        "border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
      needsFollowUp: true,
    };
  }

  if (isActiveStatus(status)) {
    return {
      label: "نشطة",
      className:
        "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
      needsFollowUp: false,
    };
  }

  if (status === "completed" || status === "ended") {
    return {
      label: "مكتملة",
      className:
        "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
      needsFollowUp: false,
    };
  }

  return {
    label: status || "غير محدد",
    className: "border border-[var(--border-default)] text-muted-foreground",
    needsFollowUp: false,
  };
}

function getWorkflowStateMeta(state: FollowUpQueueEntry["workflowState"]) {
  if (state === "RESOLVED") {
    return {
      label: "مغلقة",
      className:
        "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
    };
  }
  if (state === "ASSIGNED") {
    return {
      label: "مُعيّنة",
      className:
        "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    };
  }
  if (state === "CLAIMED") {
    return {
      label: "قيد المتابعة",
      className:
        "border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    };
  }

  return {
    label: "مفتوحة",
    className: "border border-[var(--border-default)] text-muted-foreground",
  };
}

function getDispositionLabel(disposition: FollowUpQueueEntry["disposition"]) {
  if (disposition === "ORDER_CREATED") return "تم إنشاء طلب";
  if (disposition === "CALLBACK_REQUESTED") return "طلب معاودة اتصال";
  if (disposition === "NO_ANSWER") return "لا يوجد رد";
  if (disposition === "NOT_INTERESTED") return "غير مهتم";
  if (disposition === "ESCALATED") return "تم التصعيد";
  return "-";
}

function formatDuration(seconds?: number | null) {
  const safeSeconds = Math.max(0, Math.floor(asNumber(seconds, 0)));
  if (safeSeconds <= 0) return "-";
  if (safeSeconds < 60) return `${safeSeconds}ث`;
  const minutes = Math.floor(safeSeconds / 60);
  if (minutes < 60) return `${minutes}د`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}س ${remainingMinutes}د` : `${hours}س`;
}

function timeAgo(value?: string | null) {
  if (!value) return "-";
  const epoch = new Date(value).getTime();
  if (!Number.isFinite(epoch)) return "-";
  const diffMs = Math.max(0, Date.now() - epoch);
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function percent(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function normalizeTranscript(raw: unknown): VoiceTranscriptTurn[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      const row = asRecord(entry);
      const text = asString(row.text, "");
      if (!text) return null;
      const speakerRaw = asString(row.speaker, "customer").toLowerCase();
      return {
        speaker: speakerRaw === "ai" ? "ai" : "customer",
        text,
        at: asIsoDate(row.at) || undefined,
      } as VoiceTranscriptTurn;
    })
    .filter((entry): entry is VoiceTranscriptTurn => Boolean(entry));
}

function normalizeCallRecord(row: unknown, index: number): VoiceCallRecord {
  const source = asRecord(row);
  const status = asString(source.status, "active").toLowerCase();
  const startedAt = asIsoDate(source.startedAt) || asIsoDate(source.started_at);
  const durationSeconds = asNumber(
    source.durationSeconds ?? source.duration_seconds,
    0,
  );

  return {
    id: asString(source.id, `call-${index + 1}`),
    customerPhone: asString(source.customerPhone ?? source.customer_phone, ""),
    callSid: asString(source.callSid ?? source.call_sid, ""),
    startedAt,
    endedAt: asOptionalString(source.endedAt ?? source.ended_at),
    durationSeconds: durationSeconds > 0 ? durationSeconds : null,
    handledBy: asString(
      source.handledBy ?? source.handled_by,
      "ai",
    ).toLowerCase(),
    status,
    transcript: normalizeTranscript(source.transcript),
    orderId: asOptionalString(source.orderId ?? source.order_id),
    orderNumber: asOptionalString(source.orderNumber ?? source.order_number),
    recordingUrl: asOptionalString(source.recordingUrl ?? source.recording_url),
  };
}

function normalizeCallStats(raw: unknown): VoiceCallStats {
  const source = asRecord(raw);
  return {
    periodDays: Math.max(1, asNumber(source.periodDays, 1)),
    callsToday: Math.max(0, asNumber(source.callsToday, 0)),
    aiHandled: Math.max(0, asNumber(source.aiHandled, 0)),
    staffHandled: Math.max(0, asNumber(source.staffHandled, 0)),
    missedCalls: Math.max(0, asNumber(source.missedCalls, 0)),
    ordersFromCalls: Math.max(0, asNumber(source.ordersFromCalls, 0)),
  };
}

function normalizeFollowUpQueue(raw: unknown): {
  total: number;
  queue: FollowUpQueueEntry[];
} {
  const source = asRecord(raw);
  const rows = Array.isArray(source.queue) ? source.queue : [];

  const queue = rows
    .map((entry) => {
      const row = asRecord(entry);
      const priorityRaw = asString(row.priority, "low");
      const priority: "high" | "medium" | "low" =
        priorityRaw === "high" || priorityRaw === "medium"
          ? priorityRaw
          : "low";

      return {
        callId: asString(row.callId, ""),
        callSid: asString(row.callSid, "") || undefined,
        customerPhone: asString(row.customerPhone, "-"),
        priority,
        ageMinutes: Math.max(0, asNumber(row.ageMinutes, 0)),
        missedAttempts: Math.max(0, asNumber(row.missedAttempts, 0)),
        requiresRecovery: Boolean(row.requiresRecovery),
        workflowState: ["CLAIMED", "ASSIGNED", "RESOLVED"].includes(
          asString(row.workflowState, "OPEN").toUpperCase(),
        )
          ? (asString(row.workflowState, "OPEN").toUpperCase() as
              | "CLAIMED"
              | "ASSIGNED"
              | "RESOLVED")
          : "OPEN",
        claimedBy: asOptionalString(row.claimedBy),
        assignedTo: asOptionalString(row.assignedTo),
        disposition: asString(row.disposition, "")
          .trim()
          .toUpperCase()
          .match(
            /^(ORDER_CREATED|CALLBACK_REQUESTED|NO_ANSWER|NOT_INTERESTED|ESCALATED)$/,
          )
          ? (asString(row.disposition, "").trim().toUpperCase() as
              | "ORDER_CREATED"
              | "CALLBACK_REQUESTED"
              | "NO_ANSWER"
              | "NOT_INTERESTED"
              | "ESCALATED")
          : null,
        callbackDueAt: asOptionalString(row.callbackDueAt),
        workflowUpdatedAt: asOptionalString(row.workflowUpdatedAt),
      } as FollowUpQueueEntry;
    })
    .filter((entry) => entry.callId.length > 0);

  return {
    total: Math.max(queue.length, asNumber(source.total, queue.length)),
    queue,
  };
}

function normalizeAgentPerformance(raw: unknown): {
  totalCalls: number;
  completionRatePct: number;
  conversionRatePct: number;
  agents: AgentPerformanceEntry[];
} {
  const source = asRecord(raw);
  const rows = Array.isArray(source.agents) ? source.agents : [];

  const agents = rows
    .map((entry) => {
      const row = asRecord(entry);
      return {
        handledBy: asString(row.handledBy, "unknown"),
        totalCalls: Math.max(0, asNumber(row.totalCalls, 0)),
        completedCalls: Math.max(0, asNumber(row.completedCalls, 0)),
        missedCalls: Math.max(0, asNumber(row.missedCalls, 0)),
        ordersFromCalls: Math.max(0, asNumber(row.ordersFromCalls, 0)),
        completionRatePct: Math.max(0, asNumber(row.completionRatePct, 0)),
        conversionRatePct: Math.max(0, asNumber(row.conversionRatePct, 0)),
      } as AgentPerformanceEntry;
    })
    .filter((entry) => entry.totalCalls > 0);

  return {
    totalCalls: Math.max(0, asNumber(source.totalCalls, 0)),
    completionRatePct: Math.max(0, asNumber(source.completionRatePct, 0)),
    conversionRatePct: Math.max(0, asNumber(source.conversionRatePct, 0)),
    agents,
  };
}

function normalizeQueueHealth(raw: unknown): CallQueueHealth {
  const source = asRecord(raw);
  const healthStateRaw = asString(source.healthState, "stable");
  const healthState: "stable" | "elevated" | "critical" =
    healthStateRaw === "critical" || healthStateRaw === "elevated"
      ? healthStateRaw
      : "stable";

  return {
    pressureScore: Math.max(0, asNumber(source.pressureScore, 0)),
    healthState,
    activeLive: Math.max(0, asNumber(source.activeLive, 0)),
    callVolumeTrendPct: asNumber(source.callVolumeTrendPct, 0),
    serviceLevelPct: Math.max(0, asNumber(source.serviceLevelPct, 0)),
    missedRatePct: Math.max(0, asNumber(source.missedRatePct, 0)),
  };
}

function normalizeActiveCallPayload(
  payload: unknown,
): ActiveCallPayload | null {
  const source = asRecord(payload);
  const callSid = asString(source.callSid, "");
  const customerPhone = asString(source.customerPhone, "");

  if (!callSid && !customerPhone) return null;

  const durationSeconds = asNumber(source.durationSeconds, 0);

  return {
    callSid: callSid || undefined,
    customerPhone: customerPhone || undefined,
    handledBy: asString(source.handledBy, "") || undefined,
    status: asString(source.status, "") || undefined,
    durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
    orderId: asString(source.orderId, "") || undefined,
  };
}

export default function CallsPage() {
  const { merchantId, apiKey } = useMerchant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<VoiceCallRecord[]>([]);
  const [stats, setStats] = useState<VoiceCallStats>(defaultStats);
  const [expandedCallIds, setExpandedCallIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<CallsViewFilter>("all");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [followUpTotal, setFollowUpTotal] = useState(0);
  const [followUpQueue, setFollowUpQueue] = useState<FollowUpQueueEntry[]>([]);
  const [supervisorActorId, setSupervisorActorId] = useState("");
  const [assignDraftByCallId, setAssignDraftByCallId] = useState<
    Record<string, string>
  >({});
  const [queueActionLoadingCallId, setQueueActionLoadingCallId] = useState<
    string | null
  >(null);
  const [resolveDialogCall, setResolveDialogCall] =
    useState<FollowUpQueueEntry | null>(null);
  const [resolveDisposition, setResolveDisposition] = useState<
    | "ORDER_CREATED"
    | "CALLBACK_REQUESTED"
    | "NO_ANSWER"
    | "NOT_INTERESTED"
    | "ESCALATED"
  >("NO_ANSWER");
  const [resolveNote, setResolveNote] = useState("");
  const [resolveCallbackDelayMinutes, setResolveCallbackDelayMinutes] =
    useState(120);
  const [queueHealth, setQueueHealth] =
    useState<CallQueueHealth>(defaultQueueHealth);
  const [agentPerformance, setAgentPerformance] = useState<{
    totalCalls: number;
    completionRatePct: number;
    conversionRatePct: number;
    agents: AgentPerformanceEntry[];
  }>({
    totalCalls: 0,
    completionRatePct: 0,
    conversionRatePct: 0,
    agents: [],
  });
  const [opsMetricsUnavailable, setOpsMetricsUnavailable] = useState(false);

  const [activeCall, setActiveCall] = useState<ActiveCallPayload | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<
    "delivery" | "pickup" | "dine_in"
  >("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "transfer"
  >("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderItems, setOrderItems] = useState<ManualOrderItem[]>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const loadCalls = useCallback(async () => {
    if (!apiKey) return;

    const response = await merchantApi.getCalls(merchantId, apiKey, {
      limit: 50,
      offset: 0,
    });

    const rows = Array.isArray(response?.calls) ? response.calls : [];

    setCalls(
      rows.map((row: unknown, index: number) =>
        normalizeCallRecord(row, index),
      ),
    );
  }, [merchantId, apiKey]);

  const loadStats = useCallback(async () => {
    if (!apiKey) return;

    const response = await merchantApi.getCallStats(merchantId, apiKey, 1);
    setStats(normalizeCallStats(response));
  }, [merchantId, apiKey]);

  const loadOperations = useCallback(async () => {
    if (!apiKey) {
      setFollowUpTotal(0);
      setFollowUpQueue([]);
      setQueueHealth(defaultQueueHealth);
      setAgentPerformance({
        totalCalls: 0,
        completionRatePct: 0,
        conversionRatePct: 0,
        agents: [],
      });
      setOpsMetricsUnavailable(false);
      return;
    }

    try {
      const [followUpRaw, queueHealthRaw, agentPerformanceRaw] =
        await Promise.all([
          merchantApi.getCallFollowUpQueue(merchantId, apiKey, {
            limit: 10,
            offset: 0,
            hours: 48,
            includeResolved: false,
          }),
          merchantApi.getCallQueueHealth(merchantId, apiKey, {
            windowMinutes: 60,
            activeGraceMinutes: 15,
          }),
          merchantApi.getCallAgentPerformance(merchantId, apiKey, {
            days: 7,
            limit: 5,
            handledBy: "all",
          }),
        ]);

      const normalizedFollowUp = normalizeFollowUpQueue(followUpRaw);
      setFollowUpTotal(normalizedFollowUp.total);
      setFollowUpQueue(normalizedFollowUp.queue);
      setQueueHealth(normalizeQueueHealth(queueHealthRaw));
      setAgentPerformance(normalizeAgentPerformance(agentPerformanceRaw));
      setOpsMetricsUnavailable(false);
    } catch {
      setFollowUpTotal(0);
      setFollowUpQueue([]);
      setQueueHealth(defaultQueueHealth);
      setAgentPerformance({
        totalCalls: 0,
        completionRatePct: 0,
        conversionRatePct: 0,
        agents: [],
      });
      setOpsMetricsUnavailable(true);
    }
  }, [merchantId, apiKey]);

  const loadCatalog = useCallback(async () => {
    if (!apiKey) {
      setCatalogProducts([]);
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    try {
      const response = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
        1,
        600,
      );

      const mapped: CatalogProduct[] = (response.items || [])
        .map((item: any) => {
          const name =
            String(
              item?.name_ar ||
                item?.nameAr ||
                item?.name ||
                item?.title ||
                item?.sku ||
                "",
            ).trim() || "منتج";
          const unitPrice = Number(
            item?.base_price ?? item?.price ?? item?.unit_price ?? 0,
          );

          return {
            id: String(item?.id || "").trim(),
            name,
            sku: String(item?.sku || "").trim() || undefined,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            isAvailable:
              item?.is_available !== false && item?.isActive !== false,
          };
        })
        .filter(
          (item: CatalogProduct) => item.id.length > 0 && item.isAvailable,
        );

      setCatalogProducts(mapped);
    } catch (error) {
      toast({
        title: "تعذر تحميل الكتالوج",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [merchantId, apiKey, toast]);

  const refreshAll = useCallback(async () => {
    if (!apiKey) {
      setCalls([]);
      setStats(defaultStats);
      setLoading(false);
      return;
    }

    setRefreshing(true);
    setLoadError(null);
    try {
      await Promise.all([loadCalls(), loadStats(), loadOperations()]);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء تحميل بيانات المكالمات";
      setLoadError(description);
      toast({
        title: "تعذر تحديث البيانات",
        description,
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [apiKey, loadCalls, loadStats, loadOperations, toast]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useWebSocketEvent<ActiveCallPayload>(
    RealTimeEvent.CALL_ACTIVE,
    (payload) => {
      const normalized = normalizeActiveCallPayload(payload);
      setActiveCall(normalized);
      const incomingPhone = String(normalized?.customerPhone || "").trim();
      if (incomingPhone.length > 0) {
        setCustomerPhone((prev) =>
          prev.trim().length > 0 ? prev : incomingPhone,
        );
      }
      void refreshAll();
    },
    [refreshAll],
  );

  useWebSocketEvent<ActiveCallPayload>(
    RealTimeEvent.CALL_ENDED,
    (payload) => {
      const endedPayload = normalizeActiveCallPayload(payload);
      const endedSid = String(endedPayload?.callSid || "").trim();
      setActiveCall((current) => {
        if (!current) return null;
        if (!endedSid) return null;
        return String(current.callSid || "") === endedSid ? null : current;
      });
      void refreshAll();
    },
    [refreshAll],
  );

  const toggleTranscript = (callId: string) => {
    setExpandedCallIds((prev) =>
      prev.includes(callId)
        ? prev.filter((id) => id !== callId)
        : [...prev, callId],
    );
  };

  const addItem = () => {
    setOrderItems((prev) => [...prev, { name: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateItem = (
    index: number,
    patch: Partial<{
      name: string;
      quantity: number;
      unitPrice: number;
      notes: string;
    }>,
  ) => {
    setOrderItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const nextQuantity =
          patch.quantity !== undefined
            ? Math.max(1, Number(patch.quantity) || 1)
            : item.quantity;
        const nextPrice =
          patch.unitPrice !== undefined
            ? Math.max(0, Number(patch.unitPrice) || 0)
            : item.unitPrice;

        return {
          ...item,
          ...patch,
          quantity: nextQuantity,
          unitPrice: nextPrice,
        };
      }),
    );
  };

  const resetOrderForm = () => {
    setCustomerName("");
    setCustomerPhone(String(activeCall?.customerPhone || ""));
    setDeliveryType("delivery");
    setDeliveryAddress("");
    setPaymentMethod("cash");
    setOrderNotes("");
    setProductSearch("");
    setOrderItems([{ name: "", quantity: 1, unitPrice: 0 }]);
  };

  const filteredCatalogProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return [];

    return catalogProducts
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(query) ||
          String(item.sku || "")
            .toLowerCase()
            .includes(query)
        );
      })
      .slice(0, 8);
  }, [catalogProducts, productSearch]);

  const addCatalogItemToOrder = useCallback((product: CatalogProduct) => {
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.catalogItemId === product.id ||
          (!item.catalogItemId && item.name === product.name),
      );

      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          catalogItemId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.unitPrice,
        },
      ];
    });

    setProductSearch("");
  }, []);

  const orderTotal = useMemo(
    () =>
      Number(
        orderItems
          .reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
            0,
          )
          .toFixed(2),
      ),
    [orderItems],
  );

  const handledCalls = stats.aiHandled + stats.staffHandled;
  const aiShare = percent(stats.aiHandled, handledCalls);
  const conversionRate = percent(
    stats.ordersFromCalls,
    Math.max(stats.callsToday, 1),
  );
  const missedRate = percent(stats.missedCalls, Math.max(stats.callsToday, 1));

  const counters = useMemo(() => {
    return calls.reduce(
      (acc, call) => {
        const status = String(call.status || "").toLowerCase();
        const handledBy = String(call.handledBy || "").toLowerCase();

        acc.all += 1;
        if (isMissedStatus(status)) acc.missed += 1;
        if (call.orderNumber) acc.withOrder += 1;
        if (!call.orderNumber) acc.withoutOrder += 1;
        if (handledBy === "ai") acc.ai += 1;
        if (handledBy !== "ai") acc.staff += 1;

        return acc;
      },
      {
        all: 0,
        missed: 0,
        withoutOrder: 0,
        withOrder: 0,
        ai: 0,
        staff: 0,
      },
    );
  }, [calls]);

  const filteredCalls = useMemo(() => {
    const normalizedPhone = phoneSearch.trim().toLowerCase();

    return calls.filter((call) => {
      const status = String(call.status || "").toLowerCase();
      const handledBy = String(call.handledBy || "").toLowerCase();

      if (viewFilter === "missed" && !isMissedStatus(status)) return false;
      if (viewFilter === "without-order" && Boolean(call.orderNumber))
        return false;
      if (viewFilter === "with-order" && !call.orderNumber) return false;
      if (viewFilter === "ai" && handledBy !== "ai") return false;
      if (viewFilter === "staff" && handledBy === "ai") return false;

      if (!normalizedPhone) return true;

      return String(call.customerPhone || "")
        .toLowerCase()
        .includes(normalizedPhone);
    });
  }, [calls, phoneSearch, viewFilter]);

  const followUpCount = useMemo(
    () =>
      calls.filter((call) => {
        const status = String(call.status || "").toLowerCase();
        return !call.orderNumber || isMissedStatus(status);
      }).length,
    [calls],
  );

  const openOrderFromCall = useCallback(
    (call: VoiceCallRecord) => {
      setCustomerName("");
      setCustomerPhone(
        String(call.customerPhone || activeCall?.customerPhone || ""),
      );
      setOrderNotes((prev) => {
        if (prev.trim().length > 0) return prev;
        return `متابعة مكالمة ${call.callSid || call.id}`;
      });
      setCreateOrderOpen(true);
    },
    [activeCall?.customerPhone],
  );

  const copyPhoneNumber = useCallback(
    async (phone: string) => {
      const value = phone.trim();
      if (!value) {
        toast({
          title: "لا يوجد رقم",
          description: "لم يتم العثور على رقم هاتف صالح للنسخ.",
          variant: "destructive",
        });
        return;
      }

      try {
        if (typeof navigator === "undefined" || !navigator.clipboard) {
          throw new Error("المتصفح لا يدعم النسخ المباشر");
        }
        await navigator.clipboard.writeText(value);
        toast({
          title: "تم النسخ",
          description: `تم نسخ الرقم ${value}`,
        });
      } catch (error) {
        toast({
          title: "فشل النسخ",
          description:
            error instanceof Error ? error.message : "تعذر نسخ الرقم حالياً.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const claimFollowUpCall = useCallback(
    async (callId: string) => {
      if (!apiKey) return;

      const actorId = supervisorActorId.trim();
      if (!actorId) {
        toast({
          title: "مطلوب معرّف المشرف",
          description: "أدخل معرّف المشرف قبل تنفيذ عمليات المتابعة.",
          variant: "destructive",
        });
        return;
      }

      setQueueActionLoadingCallId(callId);
      try {
        await merchantApi.claimCallFollowUpQueueItem(
          merchantId,
          apiKey,
          callId,
          {
            actorId,
            note: "Claimed from calls ops panel",
          },
        );
        toast({
          title: "تم استلام الحالة",
          description: "أصبحت الحالة الآن قيد المتابعة.",
        });
        await loadOperations();
      } catch (error) {
        toast({
          title: "تعذر استلام الحالة",
          description:
            error instanceof Error
              ? error.message
              : "فشلت عملية الاستلام. حاول مرة أخرى.",
          variant: "destructive",
        });
      } finally {
        setQueueActionLoadingCallId(null);
      }
    },
    [apiKey, loadOperations, merchantId, supervisorActorId, toast],
  );

  const assignFollowUpCall = useCallback(
    async (entry: FollowUpQueueEntry) => {
      if (!apiKey) return;

      const actorId = supervisorActorId.trim();
      const assigneeId = String(assignDraftByCallId[entry.callId] || "").trim();

      if (!actorId) {
        toast({
          title: "مطلوب معرّف المشرف",
          description: "أدخل معرّف المشرف قبل تنفيذ عمليات المتابعة.",
          variant: "destructive",
        });
        return;
      }

      if (!assigneeId) {
        toast({
          title: "مطلوب معرّف المسؤول",
          description: "أدخل معرّف الموظف الذي سيتم تعيين الحالة له.",
          variant: "destructive",
        });
        return;
      }

      setQueueActionLoadingCallId(entry.callId);
      try {
        await merchantApi.assignCallFollowUpQueueItem(
          merchantId,
          apiKey,
          entry.callId,
          {
            actorId,
            assigneeId,
            note: "Assigned from calls ops panel",
          },
        );
        toast({
          title: "تم تعيين الحالة",
          description: `تم تعيين المتابعة إلى ${assigneeId}.`,
        });
        setAssignDraftByCallId((prev) => ({ ...prev, [entry.callId]: "" }));
        await loadOperations();
      } catch (error) {
        toast({
          title: "تعذر تعيين الحالة",
          description:
            error instanceof Error
              ? error.message
              : "فشلت عملية التعيين. حاول مرة أخرى.",
          variant: "destructive",
        });
      } finally {
        setQueueActionLoadingCallId(null);
      }
    },
    [
      apiKey,
      assignDraftByCallId,
      loadOperations,
      merchantId,
      supervisorActorId,
      toast,
    ],
  );

  const openResolveDialog = useCallback((entry: FollowUpQueueEntry) => {
    setResolveDialogCall(entry);
    setResolveDisposition(entry.disposition || "NO_ANSWER");
    setResolveNote("");
    setResolveCallbackDelayMinutes(120);
  }, []);

  const submitResolveFollowUp = useCallback(async () => {
    if (!apiKey || !resolveDialogCall) return;

    const actorId = supervisorActorId.trim();
    if (!actorId) {
      toast({
        title: "مطلوب معرّف المشرف",
        description: "أدخل معرّف المشرف قبل تنفيذ عمليات المتابعة.",
        variant: "destructive",
      });
      return;
    }

    setQueueActionLoadingCallId(resolveDialogCall.callId);
    try {
      await merchantApi.resolveCallFollowUpQueueItem(
        merchantId,
        apiKey,
        resolveDialogCall.callId,
        {
          actorId,
          disposition: resolveDisposition,
          note: resolveNote.trim() || undefined,
          callbackDelayMinutes:
            resolveDisposition === "CALLBACK_REQUESTED"
              ? Math.max(
                  15,
                  Math.min(
                    7 * 24 * 60,
                    Number(resolveCallbackDelayMinutes) || 120,
                  ),
                )
              : undefined,
        },
      );
      toast({
        title: "تم إغلاق الحالة",
        description: "تم حفظ الحالة النهائية بنجاح.",
      });
      setResolveDialogCall(null);
      setResolveNote("");
      setResolveDisposition("NO_ANSWER");
      setResolveCallbackDelayMinutes(120);
      await loadOperations();
    } catch (error) {
      toast({
        title: "تعذر إغلاق الحالة",
        description:
          error instanceof Error
            ? error.message
            : "فشلت عملية إغلاق الحالة. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setQueueActionLoadingCallId(null);
    }
  }, [
    apiKey,
    loadOperations,
    merchantId,
    resolveCallbackDelayMinutes,
    resolveDialogCall,
    resolveDisposition,
    resolveNote,
    supervisorActorId,
    toast,
  ]);

  const submitManualOrder = async () => {
    if (!apiKey) return;

    const cleanedName = customerName.trim();
    const cleanedPhone = customerPhone.trim();
    const cleanedAddress = deliveryAddress.trim();

    const normalizedItems = orderItems
      .map((item) => ({
        catalogItemId: item.catalogItemId,
        name: String(item.name || "").trim(),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        notes: item.notes?.trim() || undefined,
      }))
      .filter((item) => item.name.length > 0);

    if (!cleanedName) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال اسم العميل",
        variant: "destructive",
      });
      return;
    }

    if (!cleanedPhone) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال رقم هاتف العميل",
        variant: "destructive",
      });
      return;
    }

    if (normalizedItems.length === 0) {
      toast({
        title: "بيانات ناقصة",
        description: "أضف عنصراً واحداً على الأقل",
        variant: "destructive",
      });
      return;
    }

    if (deliveryType === "delivery" && !cleanedAddress) {
      toast({
        title: "بيانات ناقصة",
        description: "عنوان التوصيل مطلوب لهذا النوع من الطلب",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrder(true);
    try {
      const created = await merchantApi.createManualOrder(merchantId, apiKey, {
        customerName: cleanedName,
        customerPhone: cleanedPhone,
        items: normalizedItems,
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery" ? cleanedAddress : undefined,
        paymentMethod,
        notes: orderNotes.trim() || undefined,
        source: "calls",
      });

      toast({
        title: "تم إنشاء الطلب",
        description: `رقم الطلب: ${String(created.orderNumber || "-")}`,
      });

      setCreateOrderOpen(false);
      resetOrderForm();
      await refreshAll();
    } catch (error) {
      toast({
        title: "فشل إنشاء الطلب",
        description:
          error instanceof Error ? error.message : "تعذر إنشاء الطلب حالياً",
        variant: "destructive",
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const activeCallBadge = activeCall ? (
    <Badge className="bg-[var(--success-muted)] text-[var(--accent-success)] hover:bg-[var(--success-muted)]">
      <PhoneCall className="ml-1 h-3.5 w-3.5" />
      {`مكالمة نشطة${activeCall.customerPhone ? ` • ${activeCall.customerPhone}` : ""}${activeCall.durationSeconds ? ` • ${formatDuration(activeCall.durationSeconds)}` : ""}`}
    </Badge>
  ) : (
    <Badge variant="secondary">لا توجد مكالمة نشطة</Badge>
  );

  const hasFiltersApplied =
    viewFilter !== "all" || phoneSearch.trim().length > 0;
  const topFollowUpQueue = useMemo(
    () => followUpQueue.slice(0, 3),
    [followUpQueue],
  );
  const topAgentPerformance = useMemo(
    () => agentPerformance.agents.slice(0, 3),
    [agentPerformance.agents],
  );

  const queueHealthMeta = useMemo(() => {
    if (queueHealth.healthState === "critical") {
      return {
        label: "حرجة",
        className:
          "text-[var(--accent-danger)] border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12",
      };
    }
    if (queueHealth.healthState === "elevated") {
      return {
        label: "مرتفعة",
        className:
          "text-[var(--accent-warning)] border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12",
      };
    }
    return {
      label: "مستقرة",
      className:
        "text-[var(--accent-success)] border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12",
    };
  }, [queueHealth.healthState]);

  return (
    <>
      <PageHeader
        title="المكالمات"
        description="لوحة تشغيلية للمكالمات مع فرز أولويات المتابعة وربط المكالمة بالطلب مباشرة."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {activeCallBadge}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              className="w-full gap-2 sm:w-auto"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              تحديث
            </Button>
            {activeCall ? (
              <Button
                size="sm"
                onClick={() => setCreateOrderOpen(true)}
                className="w-full gap-2 sm:w-auto"
              >
                <ShoppingCart className="h-4 w-4" />
                إنشاء طلب
              </Button>
            ) : null}
          </div>
        }
      />

      {loadError ? (
        <div className="mb-6 rounded-lg border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/10 p-3">
          <p className="text-sm font-medium text-[var(--accent-danger)]">
            تعذر تحديث بيانات المكالمات
          </p>
          <p className="mt-1 text-xs text-[var(--accent-danger)]/80">
            {loadError}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void refreshAll()}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">مكالمات اليوم</p>
            <p className="mt-1 text-2xl font-bold">{stats.callsToday}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              آخر مزامنة: {timeAgo(lastSyncedAt)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">تمت بواسطة الذكاء</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-blue)]">
              {stats.aiHandled}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              حصة الذكاء: {aiShare}% من المكالمات المعالجة
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">طلبات من المكالمات</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-success)]">
              {stats.ordersFromCalls}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              معدل التحويل: {conversionRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">مكالمات فائتة</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-warning)]">
              {stats.missedCalls}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              نسبة الفاقد: {missedRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">صحة صف المكالمات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">مؤشر الضغط</p>
              <p className="text-xl font-bold">{queueHealth.pressureScore}</p>
            </div>
            <Badge className={queueHealthMeta.className}>
              {queueHealthMeta.label}
            </Badge>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted-foreground">
              <p>نشط الآن: {queueHealth.activeLive}</p>
              <p>مستوى الخدمة: {queueHealth.serviceLevelPct}%</p>
              <p>اتجاه الحجم: {queueHealth.callVolumeTrendPct}%</p>
              <p>معدل الفاقد: {queueHealth.missedRatePct}%</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طابور المتابعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">إجمالي الحالات</p>
              <p className="text-xl font-bold">{followUpTotal}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">معرّف المشرف</p>
              <Input
                value={supervisorActorId}
                onChange={(event) => setSupervisorActorId(event.target.value)}
                placeholder="ops-supervisor-1"
                dir="ltr"
              />
            </div>
            {topFollowUpQueue.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لا توجد حالات متابعة حالياً.
              </p>
            ) : (
              topFollowUpQueue.map((entry) => (
                <div
                  key={entry.callId}
                  className="rounded-md border p-2 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium" dir="ltr">
                      {entry.customerPhone}
                    </p>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{entry.priority}</Badge>
                      <Badge
                        className={
                          getWorkflowStateMeta(entry.workflowState).className
                        }
                      >
                        {getWorkflowStateMeta(entry.workflowState).label}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    عمر الحالة: {entry.ageMinutes} دقيقة • محاولات فائتة:{" "}
                    {entry.missedAttempts}
                  </p>
                  {entry.claimedBy ? (
                    <p className="text-muted-foreground">
                      المستلم: {entry.claimedBy}
                    </p>
                  ) : null}
                  {entry.assignedTo ? (
                    <p className="text-muted-foreground">
                      المسؤول: {entry.assignedTo}
                    </p>
                  ) : null}
                  {entry.disposition ? (
                    <p className="text-muted-foreground">
                      الحالة النهائية: {getDispositionLabel(entry.disposition)}
                    </p>
                  ) : null}
                  {entry.callbackDueAt ? (
                    <p className="text-[var(--accent-blue)]">
                      موعد المعاودة:{" "}
                      {new Date(entry.callbackDueAt).toLocaleString("ar-EG")}
                    </p>
                  ) : null}

                  {entry.workflowState !== "RESOLVED" ? (
                    <div className="space-y-2 rounded-md bg-muted/30 p-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={queueActionLoadingCallId === entry.callId}
                          onClick={() => void claimFollowUpCall(entry.callId)}
                        >
                          {queueActionLoadingCallId === entry.callId ? (
                            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          استلام
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={queueActionLoadingCallId === entry.callId}
                          onClick={() => openResolveDialog(entry)}
                        >
                          إغلاق
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          placeholder="معرّف المسؤول"
                          value={assignDraftByCallId[entry.callId] || ""}
                          onChange={(event) =>
                            setAssignDraftByCallId((prev) => ({
                              ...prev,
                              [entry.callId]: event.target.value,
                            }))
                          }
                          dir="ltr"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={queueActionLoadingCallId === entry.callId}
                          onClick={() => void assignFollowUpCall(entry)}
                        >
                          تعيين
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">أداء المعالجة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-muted-foreground">إجمالي</p>
                <p className="text-sm font-semibold">
                  {agentPerformance.totalCalls}
                </p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-muted-foreground">اكتمال</p>
                <p className="text-sm font-semibold">
                  {agentPerformance.completionRatePct}%
                </p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-muted-foreground">تحويل</p>
                <p className="text-sm font-semibold">
                  {agentPerformance.conversionRatePct}%
                </p>
              </div>
            </div>

            {topAgentPerformance.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لا توجد بيانات أداء كافية.
              </p>
            ) : (
              topAgentPerformance.map((agent) => (
                <div
                  key={`${agent.handledBy}-${agent.totalCalls}`}
                  className="rounded-md border p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium uppercase">{agent.handledBy}</p>
                    <p className="text-muted-foreground">
                      {agent.totalCalls} مكالمة
                    </p>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    اكتمال {agent.completionRatePct}% • تحويل{" "}
                    {agent.conversionRatePct}%
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {opsMetricsUnavailable ? (
        <div className="mb-6 rounded-lg border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 p-3 text-xs text-[var(--accent-warning)]">
          بعض مؤشرات التشغيل المتقدمة غير متاحة حالياً. تم الاحتفاظ باللوحة
          الأساسية دون تعطيل سير العمل.
        </div>
      ) : null}

      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={viewFilter === "all" ? "default" : "outline"}
              onClick={() => setViewFilter("all")}
            >
              الكل ({counters.all})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "missed" ? "default" : "outline"}
              onClick={() => setViewFilter("missed")}
            >
              فائتة ({counters.missed})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "without-order" ? "default" : "outline"}
              onClick={() => setViewFilter("without-order")}
            >
              بدون طلب ({counters.withoutOrder})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "with-order" ? "default" : "outline"}
              onClick={() => setViewFilter("with-order")}
            >
              مرتبطة بطلب ({counters.withOrder})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "ai" ? "default" : "outline"}
              onClick={() => setViewFilter("ai")}
            >
              AI ({counters.ai})
            </Button>
            <Button
              size="sm"
              variant={viewFilter === "staff" ? "default" : "outline"}
              onClick={() => setViewFilter("staff")}
            >
              Staff ({counters.staff})
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={phoneSearch}
              onChange={(event) => setPhoneSearch(event.target.value)}
              placeholder="بحث برقم الهاتف"
              className="sm:max-w-xs"
              dir="ltr"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasFiltersApplied}
              onClick={() => {
                setViewFilter("all");
                setPhoneSearch("");
              }}
            >
              مسح الفلاتر
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            حالات المتابعة العاجلة: {followUpCount}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            آخر المكالمات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <TableSkeleton rows={5} columns={1} />
          ) : filteredCalls.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {hasFiltersApplied
                ? "لا توجد مكالمات مطابقة للفلاتر الحالية."
                : "لا توجد مكالمات مسجلة بعد."}
              {hasFiltersApplied ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mr-2"
                  onClick={() => {
                    setViewFilter("all");
                    setPhoneSearch("");
                  }}
                >
                  إعادة عرض الكل
                </Button>
              ) : null}
            </div>
          ) : (
            filteredCalls.map((call) => {
              const isExpanded = expandedCallIds.includes(call.id);
              const isAi = String(call.handledBy || "").toLowerCase() === "ai";
              const normalizedStatus = String(call.status || "").toLowerCase();
              const statusMeta = getStatusMeta(normalizedStatus);
              const needsFollowUp =
                statusMeta.needsFollowUp || !call.orderNumber;

              return (
                <div key={call.id} className="app-data-card space-y-3 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {call.customerPhone || "غير معروف"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.startedAt
                          ? new Date(call.startedAt).toLocaleString("ar-EG")
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.callSid ? `SID: ${call.callSid}` : "بدون SID"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={
                          isAi
                            ? "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]"
                            : "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]"
                        }
                      >
                        {isAi ? (
                          <Bot className="ml-1 h-3.5 w-3.5" />
                        ) : (
                          <User className="ml-1 h-3.5 w-3.5" />
                        )}
                        {isAi ? "AI" : "Staff"}
                      </Badge>

                      <Badge
                        variant="secondary"
                        className={statusMeta.className}
                      >
                        {statusMeta.label}
                      </Badge>

                      <Badge variant="outline">
                        {formatDuration(call.durationSeconds)}
                      </Badge>

                      {call.orderNumber ? (
                        <Badge className="border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)] hover:bg-[var(--accent-success)]/12">
                          طلب #{call.orderNumber}
                        </Badge>
                      ) : (
                        <Badge variant="outline">بدون طلب</Badge>
                      )}

                      {!call.orderNumber ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openOrderFromCall(call)}
                        >
                          <ShoppingCart className="ml-1 h-3.5 w-3.5" />
                          تهيئة طلب
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void copyPhoneNumber(call.customerPhone || "")
                        }
                      >
                        <Copy className="ml-1 h-3.5 w-3.5" />
                        نسخ الرقم
                      </Button>

                      {call.recordingUrl ? (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={call.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="ml-1 h-3.5 w-3.5" />
                            التسجيل
                          </a>
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTranscript(call.id)}
                        className="w-full sm:w-auto"
                      >
                        سجل المكالمة
                        {isExpanded ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {needsFollowUp ? (
                    <p className="text-xs text-[var(--accent-warning)]">
                      تحتاج هذه المكالمة متابعة بشرية لضمان الإغلاق وربطها بطلب.
                    </p>
                  ) : null}

                  {isExpanded && (
                    <div className="space-y-2 rounded-md bg-muted/40 p-3">
                      {call.transcript.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          لا يوجد نص محادثة محفوظ.
                        </p>
                      ) : (
                        call.transcript.map((entry, index) => (
                          <div
                            key={`${call.id}-${index}`}
                            className="rounded-md bg-background p-2"
                          >
                            <p className="text-xs text-muted-foreground">
                              {entry.speaker === "ai" ? "المساعد" : "العميل"}
                              {entry.at
                                ? ` • ${new Date(entry.at).toLocaleTimeString("ar-EG")}`
                                : ""}
                            </p>
                            <p className="mt-1 text-sm leading-6">
                              {entry.text}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(resolveDialogCall)}
        onOpenChange={(open) => {
          if (queueActionLoadingCallId) return;
          if (!open) {
            setResolveDialogCall(null);
            setResolveDisposition("NO_ANSWER");
            setResolveNote("");
            setResolveCallbackDelayMinutes(120);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إغلاق حالة المتابعة</DialogTitle>
            <DialogDescription>
              {resolveDialogCall
                ? `الحالة: ${resolveDialogCall.customerPhone}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">معرّف المشرف</p>
              <Input
                value={supervisorActorId}
                onChange={(event) => setSupervisorActorId(event.target.value)}
                placeholder="ops-supervisor-1"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">النتيجة النهائية</p>
              <Select
                value={resolveDisposition}
                onValueChange={(
                  value:
                    | "ORDER_CREATED"
                    | "CALLBACK_REQUESTED"
                    | "NO_ANSWER"
                    | "NOT_INTERESTED"
                    | "ESCALATED",
                ) => setResolveDisposition(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORDER_CREATED">تم إنشاء طلب</SelectItem>
                  <SelectItem value="CALLBACK_REQUESTED">
                    طلب معاودة اتصال
                  </SelectItem>
                  <SelectItem value="NO_ANSWER">لا يوجد رد</SelectItem>
                  <SelectItem value="NOT_INTERESTED">غير مهتم</SelectItem>
                  <SelectItem value="ESCALATED">تم التصعيد</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resolveDisposition === "CALLBACK_REQUESTED" ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  تأخير المعاودة (بالدقائق)
                </p>
                <Input
                  type="number"
                  min={15}
                  max={10080}
                  value={resolveCallbackDelayMinutes}
                  onChange={(event) =>
                    setResolveCallbackDelayMinutes(
                      Math.max(15, Number(event.target.value || 120)),
                    )
                  }
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ملاحظات المشرف</p>
              <Textarea
                rows={3}
                value={resolveNote}
                onChange={(event) => setResolveNote(event.target.value)}
                placeholder="سبب الإغلاق أو تفاصيل المتابعة"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setResolveDialogCall(null)}
                disabled={Boolean(queueActionLoadingCallId)}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => void submitResolveFollowUp()}
                disabled={Boolean(queueActionLoadingCallId)}
              >
                {queueActionLoadingCallId ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : null}
                حفظ الإغلاق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOrderOpen}
        onOpenChange={(open) => {
          if (creatingOrder) return;
          setCreateOrderOpen(open);
          if (!open) {
            resetOrderForm();
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إنشاء طلب أثناء المكالمة</DialogTitle>
            <DialogDescription>
              يمكنك تسجيل الطلب فوراً بدون مغادرة الصفحة الحالية.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">اسم العميل</p>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="مثال: أحمد محمد"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">رقم الهاتف</p>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="01000000000"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">بحث المنتجات وإضافتها</p>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="اكتب اسم المنتج أو SKU..."
                  className="pr-9"
                />

                {productSearch.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                    {catalogLoading ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري تحميل المنتجات...
                      </div>
                    ) : filteredCatalogProducts.length > 0 ? (
                      filteredCatalogProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="w-full text-right px-3 py-2 hover:bg-muted transition-colors"
                          onClick={() => addCatalogItemToOrder(product)}
                        >
                          <div className="font-medium text-sm">
                            {product.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center justify-between">
                            <span dir="ltr">{product.sku || "-"}</span>
                            <span>{formatCurrency(product.unitPrice)}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        لا توجد منتجات مطابقة
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <p className="text-sm font-medium">عناصر الطلب</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addItem}
                >
                  <Plus className="ml-1 h-3.5 w-3.5" />
                  إضافة عنصر
                </Button>
              </div>
              <div className="divide-y">
                {orderItems.map((item, index) => (
                  <div key={`order-item-${index}`} className="p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input
                        value={item.name}
                        onChange={(event) =>
                          updateItem(index, { name: event.target.value })
                        }
                        placeholder="اسم المنتج"
                        className="md:col-span-2"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(index, {
                            quantity: Number(event.target.value || 1),
                          })
                        }
                        placeholder="الكمية"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateItem(index, {
                            unitPrice: Number(event.target.value || 0),
                          })
                        }
                        placeholder="سعر الوحدة"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        value={item.notes || ""}
                        onChange={(event) =>
                          updateItem(index, { notes: event.target.value })
                        }
                        placeholder="ملاحظات العنصر (اختياري)"
                      />
                      {orderItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">نوع الطلب</p>
                <Select
                  value={deliveryType}
                  onValueChange={(value: "delivery" | "pickup" | "dine_in") =>
                    setDeliveryType(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">توصيل</SelectItem>
                    <SelectItem value="pickup">استلام</SelectItem>
                    <SelectItem value="dine_in">داخل الفرع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">طريقة الدفع</p>
                <Select
                  value={paymentMethod}
                  onValueChange={(value: "cash" | "card" | "transfer") =>
                    setPaymentMethod(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">كاش</SelectItem>
                    <SelectItem value="card">كارت</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deliveryType === "delivery" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">عنوان التوصيل</p>
                <Input
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="الحي، الشارع، رقم العمارة..."
                />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">ملاحظات الطلب</p>
              <Textarea
                rows={3}
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                placeholder="أي تفاصيل إضافية"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">إجمالي الطلب</span>
              <span className="text-sm font-bold">
                {formatCurrency(orderTotal)}
              </span>
            </div>

            <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  if (creatingOrder) return;
                  setCreateOrderOpen(false);
                  resetOrderForm();
                }}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => void submitManualOrder()}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                {creatingOrder ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  "حفظ الطلب"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
