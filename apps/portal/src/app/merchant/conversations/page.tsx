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
} from "lucide-react";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AiInsightsCard,
  generateConversationInsights,
} from "@/components/ai/ai-insights-card";
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

// Lead Score Badge Component
function LeadScoreBadge({ score }: { score?: "HOT" | "WARM" | "COLD" | null }) {
  if (!score) return null;

  const config = {
    HOT: { icon: Flame, color: "bg-red-500 text-white", label: "🔥 ساخن" },
    WARM: {
      icon: Thermometer,
      color: "bg-orange-500 text-white",
      label: "🌡️ دافئ",
    },
    COLD: {
      icon: Snowflake,
      color: "bg-blue-500 text-white",
      label: "❄️ بارد",
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
      ? "bg-green-500"
      : confidence >= 50
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <Badge className={cn("text-xs text-white", color)}>
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
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
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

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch full list, then apply the same effective-state filter used in UI badges.
      const response = await merchantApi.getConversations(merchantId, apiKey);
      setConversations(response.conversations || []);
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
        setMessages(response.messages || []);
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
    const matchesSearch =
      getDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conv.customerPhone || "").includes(searchQuery) ||
      (conv.senderId || "").includes(searchQuery) ||
      conv.id.includes(searchQuery);
    return matchesState && matchesSearch;
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    setSending(true);
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="المحادثات"
        description="إدارة ومتابعة محادثات العملاء"
        actions={
          <Button variant="outline" size="sm" onClick={fetchConversations}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      <AiInsightsCard
        insights={generateConversationInsights({
          totalConversations: stats.total ?? 0,
          activeConversations: stats.active ?? 0,
          avgResponseTime: 0,
          unreadCount: stats.humanTakeover ?? 0,
        })}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">إجمالي المحادثات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-xs text-muted-foreground">نشطة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <UserCheck className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.humanTakeover}</p>
              <p className="text-xs text-muted-foreground">تدخل بشري</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">مكتملة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-400px)] min-h-[500px]">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="space-y-3">
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
            <ScrollArea className="h-[calc(100vh-550px)] min-h-[350px]">
              {filteredConversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    لا توجد محادثات
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "w-full p-4 text-right hover:bg-muted/50 transition-colors",
                        selectedConversation?.id === conv.id && "bg-muted",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          {conv.customerAvatarUrl && (
                            <AvatarImage
                              src={conv.customerAvatarUrl}
                              alt={getDisplayName(conv)}
                            />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getDisplayName(conv).charAt(0) || (
                              <User className="h-4 w-4" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium truncate">
                              {getDisplayName(conv)}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(
                                conv.lastMessageAt || conv.updatedAt,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              className={cn(
                                "text-xs",
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
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {typeof conv.messageCount === "number"
                                ? conv.messageCount
                                : "-"}{" "}
                              رسالة
                            </p>
                            <p
                              className="text-xs text-muted-foreground"
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
        <Card className="lg:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <CardHeader className="border-b py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {selectedConversation.customerAvatarUrl && (
                        <AvatarImage
                          src={selectedConversation.customerAvatarUrl}
                          alt={getDisplayName(selectedConversation)}
                        />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getDisplayName(selectedConversation).charAt(0) || (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {getDisplayName(selectedConversation)}
                      </p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {normalizeSenderDisplay(
                          selectedConversation.customerPhone ||
                            selectedConversation.senderId,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        getStatusColor(getEffectiveState(selectedConversation)),
                      )}
                    >
                      {getStatusLabel(getEffectiveState(selectedConversation))}
                    </Badge>
                    <LeadScoreBadge score={selectedConversation.leadScore} />
                    {selectedConversation.addressConfidence !== undefined && (
                      <AddressConfidenceBadge
                        confidence={selectedConversation.addressConfidence}
                      />
                    )}
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
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-[calc(100vh-650px)] min-h-[250px] p-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      لا توجد رسائل
                    </div>
                  ) : (
                    <div className="space-y-4">
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
                              "flex gap-2",
                              isOutbound ? "flex-row-reverse" : "flex-row",
                            )}
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback
                                className={cn(
                                  isOutbound
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted",
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
                                "max-w-[70%] rounded-lg px-4 py-2",
                                isOutbound
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted",
                              )}
                            >
                              <p className="text-sm whitespace-pre-wrap">
                                {safeText || "-"}
                              </p>
                              <p
                                className={cn(
                                  "text-xs mt-1",
                                  isOutbound
                                    ? "text-primary-foreground/70"
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
              {getEffectiveState(selectedConversation) === "HUMAN_TAKEOVER" && (
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="اكتب رسالتك..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="min-h-[60px] resize-none"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!canCreate || !newMessage.trim() || sending}
                      className="shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    اضغط Enter للإرسال، أو Shift+Enter لسطر جديد
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">اختر محادثة للبدء</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
