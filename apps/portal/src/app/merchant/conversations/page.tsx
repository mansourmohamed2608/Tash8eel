"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  MessageCircle,
  Search,
  Filter,
  Send,
  RefreshCw,
  AlertCircle,
  User,
  Bot,
  Clock,
  ArrowLeftRight,
  CheckCircle,
  UserCheck,
  Flame,
  Thermometer,
  Snowflake,
  MapPin,
  Lightbulb,
  Instagram,
  Phone,
} from "lucide-react";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";

interface Message {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND" | "inbound" | "outbound";
  text: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  merchantId: string;
  customerId?: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  customerName?: string;
  customerPhone?: string;
  customerAvatarUrl?: string;
  senderId: string;
  state: string;
  isHumanTakeover: boolean;
  messageCount?: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  // Phase 1: Premium Ops fields
  leadScore?: "HOT" | "WARM" | "COLD" | null;
  nbaText?: string;
  nbaType?: string;
  addressConfidence?: number;
  objectionType?: string;
  requiresConfirmation?: boolean;
}

function normalizeConversationsPayload(response: any): Conversation[] {
  const source = Array.isArray(response?.conversations)
    ? response.conversations
    : Array.isArray(response?.data)
      ? response.data
      : [];

  return source
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => ({
      ...item,
      id: String(item.id ?? ""),
      channel: String(item.channel || "whatsapp").toLowerCase() as
        | "whatsapp"
        | "messenger"
        | "instagram",
      senderId: String(item.senderId ?? ""),
      state: String(item.state ?? ""),
      lastMessageAt: String(item.lastMessageAt ?? item.updatedAt ?? ""),
      createdAt: String(item.createdAt ?? ""),
      updatedAt: String(item.updatedAt ?? ""),
      isHumanTakeover: Boolean(item.isHumanTakeover),
    }))
    .filter((item: Conversation) => item.id.length > 0);
}

function normalizeMessagesPayload(payload: any): Message[] {
  const source = Array.isArray(payload) ? payload : [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  return source
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => ({
      id: String(item.id ?? ""),
      conversationId: String(item.conversationId ?? item.conversation_id ?? ""),
      direction: String(item.direction ?? "inbound") as Message["direction"],
      text: String(item.text ?? ""),
      createdAt: String(item.createdAt ?? item.created_at ?? ""),
    }))
    .filter((item: Message) => item.id.length > 0)
    .filter((item: Message) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);

      const normalizedText = String(item.text || "")
        .replace(/\s+/g, " ")
        .trim();
      const createdAtMs = Date.parse(item.createdAt);
      const secondBucket = Number.isNaN(createdAtMs)
        ? item.createdAt
        : String(Math.floor(createdAtMs / 1000));

      const fingerprint = [
        item.conversationId,
        String(item.direction || "").toLowerCase(),
        normalizedText,
        secondBucket,
      ].join("|");

      if (seenFingerprints.has(fingerprint)) {
        return false;
      }
      seenFingerprints.add(fingerprint);
      return true;
    })
    .sort((a, b) => {
      const aTs = Date.parse(a.createdAt);
      const bTs = Date.parse(b.createdAt);
      if (Number.isNaN(aTs) || Number.isNaN(bTs)) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return aTs - bTs;
    });
}

function ConversationChannelIcon({
  channel,
}: {
  channel?: "whatsapp" | "messenger" | "instagram" | string;
}) {
  const normalized = String(channel || "whatsapp").toLowerCase();

  if (normalized === "messenger") {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/12"
        title="Messenger"
      >
        <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
      </span>
    );
  }

  if (normalized === "instagram") {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/12"
        title="Instagram"
      >
        <span className="text-[9px] font-bold leading-none text-[var(--accent-gold)]">
          IG
        </span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--accent-success)]/20 bg-[var(--accent-success)]/12"
      title="WhatsApp"
    >
      <MessageCircle className="h-3.5 w-3.5 text-[var(--accent-success)]" />
    </span>
  );
}

const CHANNEL_FILTERS = [
  { id: "all", label: "الكل", icon: MessageSquare, color: "" },
  {
    id: "whatsapp",
    label: "واتساب",
    icon: MessageCircle,
    color: "text-[var(--accent-success)]",
  },
  {
    id: "messenger",
    label: "ماسنجر",
    icon: MessageSquare,
    color: "text-[var(--accent-blue)]",
  },
  {
    id: "instagram",
    label: "إنستاجرام",
    icon: Instagram,
    color: "text-[var(--accent-gold)]",
  },
];

// Lead Score Badge Component
function LeadScoreBadge({ score }: { score?: "HOT" | "WARM" | "COLD" | null }) {
  if (!score) return null;

  const config = {
    HOT: {
      icon: Flame,
      color:
        "border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/15 text-[var(--accent-danger)]",
      label: "ساخن",
    },
    WARM: {
      icon: Thermometer,
      color:
        "border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]",
      label: "دافئ",
    },
    COLD: {
      icon: Snowflake,
      color:
        "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]",
      label: "بارد",
    },
  };

  const cfg = config[score];
  const Icon = cfg.icon;

  return (
    <Badge className={cn("text-xs", cfg.color)}>
      <Icon className="h-3 w-3 ml-1" />
      {cfg.label}
    </Badge>
  );
}

// Address Confidence Badge
function AddressConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence === null) return null;

  const color =
    confidence >= 80
      ? "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/15 text-[var(--accent-success)]"
      : confidence >= 50
        ? "border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]"
        : "border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/15 text-[var(--accent-danger)]";

  return (
    <Badge className={cn("text-xs", color)}>
      <MapPin className="h-3 w-3 ml-1" />
      {confidence}%
    </Badge>
  );
}

// NBA (Next Best Action) Display
function NbaDisplay({
  nbaText,
  nbaType,
}: {
  nbaText?: string;
  nbaType?: string;
}) {
  if (!nbaText) return null;

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
        <div>
          <p className="text-xs text-primary font-medium">الإجراء المقترح</p>
          <p className="text-sm text-foreground mt-1">{nbaText}</p>
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const { merchantId, apiKey } = useMerchant();
  const { canCreate, canEdit, isReadOnly } = useRoleAccess("conversations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const normalizeSenderDisplay = useCallback(
    (value?: string | number | null) => {
      if (value == null) return "عميل";
      const str = String(value);
      if (!str) return "عميل";
      const cleaned = str
        .replace(/^whatsapp:/i, "")
        .replace(/@c\.us$/i, "")
        .trim();
      if (!cleaned) return "عميل";
      if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
      return cleaned;
    },
    [],
  );

  const getEffectiveState = useCallback((conversation: Conversation) => {
    if (conversation.isHumanTakeover) return "HUMAN_TAKEOVER";
    return conversation.state;
  }, []);

  const getDisplayName = useCallback(
    (conversation: Conversation) => {
      const name =
        conversation.customerName != null
          ? String(conversation.customerName)
          : "";
      if (name.trim().length > 0) {
        return name.trim();
      }
      const phone =
        conversation.customerPhone != null
          ? String(conversation.customerPhone)
          : "";
      if (phone.trim().length > 0) {
        return normalizeSenderDisplay(phone);
      }
      return normalizeSenderDisplay(conversation.senderId);
    },
    [normalizeSenderDisplay],
  );

  const getCustomerAvatarLetter = useCallback((conversation: Conversation) => {
    const seed =
      String(conversation.customerName || "").trim() ||
      String(conversation.customerPhone || "").trim() ||
      String(conversation.senderId || "").trim();
    return Array.from(seed)[0] || "ع";
  }, []);

  const getCustomerAvatarTone = useCallback((conversation: Conversation) => {
    const seed = Array.from(
      String(
        conversation.customerName ||
          conversation.customerPhone ||
          conversation.senderId ||
          "",
      ),
    ).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const tones = [
      "bg-[color:#1d4ed8] text-white",
      "bg-[color:#065f46] text-white",
      "bg-[color:#7c3aed] text-white",
      "bg-[color:#92400e] text-white",
      "bg-[color:#9f1239] text-white",
      "bg-[color:#0f766e] text-white",
      "bg-[color:#3f3f46] text-white",
      "bg-[color:#1e40af] text-white",
    ];
    return tones[seed % tones.length];
  }, []);

  const getConversationPreview = useCallback(
    (conversation: Conversation) => {
      const latestMessage = [...(conversation.messages || [])]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .find((message) => String(message.text || "").trim().length > 0);

      if (latestMessage) {
        return latestMessage.text.trim();
      }

      if (conversation.isHumanTakeover) {
        return "المحادثة في وضع التدخل البشري";
      }

      return `الحالة الحالية: ${getStatusLabel(getEffectiveState(conversation))}`;
    },
    [getEffectiveState],
  );

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch full list, then apply the same effective-state filter used in UI badges.
      const response = await merchantApi.getConversations(merchantId, apiKey);
      setConversations(normalizeConversationsPayload(response));
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  const fetchMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      try {
        const response = await merchantApi.getConversation(
          conversationId,
          apiKey,
        );
        setMessages(normalizeMessagesPayload(response.messages));
        setSelectedConversation(response);
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    },
    [apiKey],
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation?.id, fetchMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter conversations by state + search
  const filteredConversations = conversations.filter((conv) => {
    const matchesState =
      stateFilter === "all" || getEffectiveState(conv) === stateFilter;
    const matchesChannel =
      channelFilter === "all" ||
      String(conv.channel || "whatsapp") === channelFilter;
    const matchesSearch =
      getDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conv.customerPhone || "").includes(searchQuery) ||
      (conv.senderId || "").includes(searchQuery) ||
      String(conv.id || "").includes(searchQuery);
    return matchesState && matchesChannel && matchesSearch;
  });

  useEffect(() => {
    if (!selectedConversation) return;

    const stillVisible = filteredConversations.some(
      (conv) => conv.id === selectedConversation.id,
    );
    if (!stillVisible) {
      setSelectedConversation(filteredConversations[0] ?? null);
    }
  }, [filteredConversations, selectedConversation?.id]);

  useEffect(() => {
    setSendError(null);
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (sendError && newMessage.trim().length > 0) {
      setSendError(null);
    }
  }, [newMessage, sendError]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await merchantApi.sendMessage(
        selectedConversation.id,
        apiKey,
        newMessage,
      );
      setNewMessage("");
      // Refresh messages
      await fetchMessages(selectedConversation.id);
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(
        err instanceof Error
          ? err.message
          : "تعذر إرسال الرسالة الآن. حاول مرة أخرى.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!selectedConversation || takingOver) return;

    setTakingOver(true);
    try {
      await merchantApi.takeoverConversation(
        selectedConversation.id,
        apiKey,
        "portal-user",
      );
      // Refresh conversation
      await fetchMessages(selectedConversation.id);
      await fetchConversations();
    } catch (err) {
      console.error("Failed to takeover:", err);
    } finally {
      setTakingOver(false);
    }
  };

  const handleRelease = async () => {
    if (!selectedConversation || takingOver) return;

    setTakingOver(true);
    try {
      await merchantApi.releaseConversation(selectedConversation.id, apiKey);
      // Refresh conversation
      await fetchMessages(selectedConversation.id);
      await fetchConversations();
    } catch (err) {
      console.error("Failed to release:", err);
    } finally {
      setTakingOver(false);
    }
  };

  const handleCloseConversation = async () => {
    if (!selectedConversation) return;
    try {
      await merchantApi.closeConversation(selectedConversation.id, apiKey);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id ? { ...c, state: "CLOSED" } : c,
        ),
      );
      setSelectedConversation({ ...selectedConversation, state: "CLOSED" });
    } catch (err) {
      console.error("Failed to close conversation:", err);
    }
  };

  // Calculate stats
  // "completed" = only ORDER_PLACED (conversations that resulted in an actual order)
  // "active" = everything that is not ORDER_PLACED (includes CLOSED, HUMAN_TAKEOVER, etc.)
  const stats = {
    total: conversations.length,
    active: conversations.filter((c) => getEffectiveState(c) !== "ORDER_PLACED")
      .length,
    humanTakeover: conversations.filter(
      (c) => getEffectiveState(c) === "HUMAN_TAKEOVER",
    ).length,
    completed: conversations.filter(
      (c) => getEffectiveState(c) === "ORDER_PLACED",
    ).length,
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="المحادثات" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="المحادثات" />
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">خطأ في تحميل المحادثات</h3>
              <p className="text-muted-foreground mt-2">{error}</p>
              <Button
                onClick={fetchConversations}
                variant="outline"
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn p-4 pb-6 sm:p-6">
      <PageHeader
        title="المحادثات"
        description="تابع كل محادثة نشطة، واعرف متى يتدخل الفريق أو الذكاء مباشرة."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConversations}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Conversation Desk</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                شاشة تشغيل للمحادثات الحية، التحويل للبشري، والإشارات التنفيذية
                داخل نفس السياق.
              </h2>
              <p className="app-hero-band__copy">
                راقب حالة كل محادثة، التقط الحالات التي تحتاج تدخلاً بشرياً،
                وتابع واتساب وماسنجر وإنستاجرام من عرض ثنائي يحافظ على سياق
                العميل والرسائل.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إجمالي المحادثات
              </span>
              <strong className="app-hero-band__metric-value">
                {stats.total}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">نشطة</span>
              <strong className="app-hero-band__metric-value">
                {stats.active}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">تدخل بشري</span>
              <strong className="app-hero-band__metric-value">
                {stats.humanTakeover}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">مكتملة</span>
              <strong className="app-hero-band__metric-value">
                {stats.completed}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content - Split View */}
      <div className="grid min-h-0 grid-cols-1 gap-4 xl:h-[calc(100vh-10rem)] xl:min-h-[52rem] xl:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]">
        {/* Conversations List */}
        <Card className="app-data-card h-full overflow-hidden border-border/70">
          <CardHeader className="border-b bg-[color:color-mix(in_srgb,var(--surface-muted)_55%,transparent)] pb-3">
            <div className="mb-1">
              <h3 className="app-section-title">
                <MessageSquare className="h-4 w-4 text-primary" />
                صندوق المحادثات
              </h3>
              <p className="app-section-copy">
                فلترة حسب القناة والحالة مع الحفاظ على سياق العميل.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {CHANNEL_FILTERS.map((filter) => {
                  const Icon = filter.icon;
                  const isActive = channelFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setChannelFilter(filter.id)}
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                        isActive
                          ? "border-[var(--accent-gold)] bg-[var(--accent-gold-dim)] text-[var(--accent-gold)]"
                          : "border-[var(--border-default)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]",
                      )}
                      title={filter.label}
                    >
                      <Icon
                        className={cn("h-4 w-4", isActive ? "" : filter.color)}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9"
                />
              </div>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-full">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="GREETING">ترحيب</SelectItem>
                  <SelectItem value="COLLECTING_ITEMS">جمع المنتجات</SelectItem>
                  <SelectItem value="COLLECTING_VARIANTS">
                    اختيار المتغيرات
                  </SelectItem>
                  <SelectItem value="COLLECTING_CUSTOMER_INFO">
                    بيانات العميل
                  </SelectItem>
                  <SelectItem value="COLLECTING_ADDRESS">العنوان</SelectItem>
                  <SelectItem value="NEGOTIATING">تفاوض</SelectItem>
                  <SelectItem value="CONFIRMING_ORDER">تأكيد الطلب</SelectItem>
                  <SelectItem value="TRACKING">تتبع</SelectItem>
                  <SelectItem value="FOLLOWUP">متابعة</SelectItem>
                  <SelectItem value="HUMAN_TAKEOVER">تدخل بشري</SelectItem>
                  <SelectItem value="ORDER_PLACED">طلب مكتمل</SelectItem>
                  <SelectItem value="CLOSED">مغلقة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[min(42vh,28rem)] sm:h-[min(46vh,32rem)] xl:h-[calc(100vh-16rem)] xl:min-h-[40rem]">
              {filteredConversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    لا توجد محادثات
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "w-full px-4 py-4 text-right transition-colors",
                        "hover:bg-[var(--bg-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        selectedConversation?.id === conv.id &&
                          "bg-[var(--accent-blue-dim)] ring-1 ring-inset ring-primary/15",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-11 w-11 shrink-0">
                          {conv.customerAvatarUrl && (
                            <AvatarImage
                              src={conv.customerAvatarUrl}
                              alt={getDisplayName(conv)}
                            />
                          )}
                          <AvatarFallback
                            className={cn(
                              "font-semibold",
                              getCustomerAvatarTone(conv),
                            )}
                          >
                            {getCustomerAvatarLetter(conv)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <ConversationChannelIcon channel={conv.channel} />
                              <p className="truncate text-sm font-medium sm:text-[15px]">
                                {getDisplayName(conv)}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatRelativeTime(
                                conv.lastMessageAt || conv.updatedAt,
                              )}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {getConversationPreview(conv)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge
                              className={cn(
                                "text-[11px]",
                                getStatusColor(getEffectiveState(conv)),
                              )}
                            >
                              {getStatusLabel(getEffectiveState(conv))}
                            </Badge>
                            <LeadScoreBadge score={conv.leadScore} />
                            {conv.isHumanTakeover && (
                              <Badge variant="destructive" className="text-xs">
                                <UserCheck className="h-3 w-3 ml-1" />
                                تدخل
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <p className="text-[11px] text-muted-foreground">
                              {typeof conv.messageCount === "number"
                                ? conv.messageCount
                                : "-"}{" "}
                              رسالة
                            </p>
                            <p
                              className="text-[11px] text-muted-foreground"
                              dir="ltr"
                            >
                              {normalizeSenderDisplay(
                                conv.customerPhone || conv.senderId,
                              )}
                            </p>
                            {conv.addressConfidence !== undefined && (
                              <AddressConfidenceBadge
                                confidence={conv.addressConfidence}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat View */}
        <Card className="app-data-card flex min-h-[28rem] flex-col overflow-hidden border-border/70 xl:h-full xl:min-h-0">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <CardHeader className="border-b bg-[color:color-mix(in_srgb,var(--surface-muted)_55%,transparent)] px-5 py-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    { label: "إجمالي", value: stats.total },
                    { label: "نشطة", value: stats.active },
                    { label: "تدخل بشري", value: stats.humanTakeover },
                    { label: "مكتملة", value: stats.completed },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex h-7 items-center gap-2 rounded-[4px] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-2 text-[11px] text-[var(--text-secondary)]"
                    >
                      <span>{item.label}</span>
                      <span className="font-mono text-[var(--text-primary)]">
                        {item.value}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-11 w-11">
                      {selectedConversation.customerAvatarUrl && (
                        <AvatarImage
                          src={selectedConversation.customerAvatarUrl}
                          alt={getDisplayName(selectedConversation)}
                        />
                      )}
                      <AvatarFallback
                        className={cn(
                          "font-semibold",
                          getCustomerAvatarTone(selectedConversation),
                        )}
                      >
                        {getCustomerAvatarLetter(selectedConversation)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <ConversationChannelIcon
                          channel={selectedConversation.channel}
                        />
                        <span className="truncate">
                          {getDisplayName(selectedConversation)}
                        </span>
                      </p>
                      <p
                        className="mt-1 text-sm text-muted-foreground"
                        dir="ltr"
                      >
                        {normalizeSenderDisplay(
                          selectedConversation.customerPhone ||
                            selectedConversation.senderId,
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            getStatusColor(
                              getEffectiveState(selectedConversation),
                            ),
                          )}
                        >
                          {getStatusLabel(
                            getEffectiveState(selectedConversation),
                          )}
                        </Badge>
                        <LeadScoreBadge
                          score={selectedConversation.leadScore}
                        />
                        {selectedConversation.addressConfidence !==
                          undefined && (
                          <AddressConfidenceBadge
                            confidence={selectedConversation.addressConfidence}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {canEdit &&
                      (getEffectiveState(selectedConversation) ===
                      "HUMAN_TAKEOVER" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRelease}
                          disabled={takingOver}
                        >
                          <ArrowLeftRight className="h-4 w-4 ml-1" />
                          إرجاع للذكاء
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleTakeover}
                          disabled={takingOver}
                        >
                          <UserCheck className="h-4 w-4 ml-1" />
                          استلام المحادثة
                        </Button>
                      ))}
                    {canEdit &&
                      getEffectiveState(selectedConversation) !== "CLOSED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={handleCloseConversation}
                        >
                          <CheckCircle className="h-4 w-4 ml-1" />
                          إغلاق المحادثة
                        </Button>
                      )}
                  </div>
                </div>
                {/* NBA Display */}
                {selectedConversation.nbaText && (
                  <NbaDisplay
                    nbaText={selectedConversation.nbaText}
                    nbaType={selectedConversation.nbaType}
                  />
                )}
              </CardHeader>

              {/* Messages Area */}
              <CardContent className="min-h-0 flex-1 overflow-hidden bg-[color:color-mix(in_srgb,var(--bg-surface-2)_35%,transparent)] p-0">
                <ScrollArea className="h-full px-5 py-5">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      لا توجد رسائل
                    </div>
                  ) : (
                    <div className="flex min-h-full flex-col justify-end gap-5">
                      {messages.map((msg) => {
                        const isOutbound =
                          msg.direction?.toString().toLowerCase() ===
                          "outbound";
                        const safeText = (msg.text || "")
                          .replace(/[x×]\s*undefined/gi, "")
                          .replace(/\bundefined\b/gi, "")
                          .replace(/\bnull\b/gi, "")
                          .replace(/\s{2,}/g, " ")
                          .trim();
                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex gap-3",
                              isOutbound ? "flex-row-reverse" : "flex-row",
                            )}
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback
                                className={cn(
                                  isOutbound
                                    ? "border border-[var(--accent-gold)]/20 bg-[var(--bg-surface-3)] text-[var(--accent-gold)]"
                                    : getCustomerAvatarTone(
                                        selectedConversation,
                                      ),
                                )}
                              >
                                {isOutbound ? (
                                  <Bot className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div
                              className={cn(
                                "max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[82%] xl:max-w-[78%]",
                                isOutbound
                                  ? "rounded-br-md border border-[var(--accent-gold)]/20 bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
                                  : "rounded-bl-md border border-border/60 bg-background",
                              )}
                            >
                              {isOutbound && (
                                <div className="mb-2 inline-flex h-5 items-center rounded-[4px] border border-[var(--accent-gold)]/20 bg-[var(--accent-gold-dim)] px-2 text-[10px] font-semibold text-[var(--accent-gold)]">
                                  ✦ AI
                                </div>
                              )}
                              <p className="text-sm whitespace-pre-wrap leading-6">
                                {safeText || "-"}
                              </p>
                              <p
                                className={cn(
                                  "mt-2 font-mono text-[11px]",
                                  isOutbound
                                    ? "text-[var(--text-secondary)]"
                                    : "text-muted-foreground",
                                )}
                              >
                                {formatRelativeTime(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
              </CardContent>

              {/* Message Input */}
              <div className="border-t bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-5 py-4">
                {getEffectiveState(selectedConversation) ===
                "HUMAN_TAKEOVER" ? (
                  <>
                    {sendError && (
                      <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {sendError}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Textarea
                        placeholder="اكتب رسالتك هنا..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="h-[54px] min-h-[54px] resize-none rounded-[10px] border-[var(--border-default)] bg-[var(--bg-surface-3)] px-4 py-3 leading-6"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!canCreate || !newMessage.trim() || sending}
                        className="h-10 w-10 shrink-0 rounded-[10px] px-0"
                      >
                        {sending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      اضغط Enter للإرسال، أو Shift+Enter لسطر جديد
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    لازم تستلم المحادثة أولاً قبل ما تبعت رسالة يدوية.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-muted/10">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                <p className="font-medium text-foreground">اختر محادثة للبدء</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  راجع القائمة واختر المحادثة اللي محتاجة متابعة الآن.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
