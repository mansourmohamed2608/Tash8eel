"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Bell,
  MessageSquare,
  Star,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  TrendingDown,
  FileText,
  Gift,
  TrendingUp,
  Truck,
  Cpu,
  CalendarDays,
  MessageCircle,
  Target,
  Crown,
  ShieldAlert,
  RotateCcw,
  BarChart2,
  Brain,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import portalApi from "@/lib/client";
const authenticatedApi = portalApi;
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AutomationSetting {
  type: string;
  label: string;
  labelEn: string;
  description: string;
  isEnabled: boolean;
  config: Record<string, any>;
  lastRunAt: string | null;
  checkIntervalHours?: number;
}

interface RunLog {
  automation_type: string;
  status: "success" | "error";
  messages_sent: number;
  targets_found: number;
  run_at: string;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  SUPPLIER_LOW_STOCK: <Bell className="w-5 h-5 text-amber-500" />,
  REENGAGEMENT_AUTO: <MessageSquare className="w-5 h-5 text-blue-500" />,
  REVIEW_REQUEST: <Star className="w-5 h-5 text-yellow-500" />,
  NEW_CUSTOMER_WELCOME: <UserPlus className="w-5 h-5 text-green-500" />,
  // New
  CHURN_PREVENTION: <TrendingDown className="w-5 h-5 text-purple-500" />,
  QUOTE_FOLLOWUP: <FileText className="w-5 h-5 text-cyan-500" />,
  LOYALTY_MILESTONE: <Gift className="w-5 h-5 text-pink-500" />,
  EXPENSE_SPIKE_ALERT: <TrendingUp className="w-5 h-5 text-red-500" />,
  DELIVERY_SLA_BREACH: <Truck className="w-5 h-5 text-orange-500" />,
  TOKEN_USAGE_WARNING: <Cpu className="w-5 h-5 text-slate-500" />,
  AI_ANOMALY_DETECTION: <Brain className="w-5 h-5 text-violet-500" />,
  SEASONAL_STOCK_PREP: <CalendarDays className="w-5 h-5 text-teal-500" />,
  SENTIMENT_MONITOR: <MessageCircle className="w-5 h-5 text-rose-500" />,
  LEAD_SCORE: <Target className="w-5 h-5 text-indigo-500" />,
  AUTO_VIP_TAG: <Crown className="w-5 h-5 text-yellow-600" />,
  AT_RISK_TAG: <ShieldAlert className="w-5 h-5 text-orange-600" />,
  HIGH_RETURN_FLAG: <RotateCcw className="w-5 h-5 text-red-600" />,
};

const COLORS: Record<string, string> = {
  SUPPLIER_LOW_STOCK: "border-amber-200 bg-amber-50",
  REENGAGEMENT_AUTO: "border-blue-200 bg-blue-50",
  REVIEW_REQUEST: "border-yellow-200 bg-yellow-50",
  NEW_CUSTOMER_WELCOME: "border-green-200 bg-green-50",
  CHURN_PREVENTION: "border-purple-200 bg-purple-50",
  QUOTE_FOLLOWUP: "border-cyan-200 bg-cyan-50",
  LOYALTY_MILESTONE: "border-pink-200 bg-pink-50",
  EXPENSE_SPIKE_ALERT: "border-red-200 bg-red-50",
  DELIVERY_SLA_BREACH: "border-orange-200 bg-orange-50",
  TOKEN_USAGE_WARNING: "border-slate-200 bg-slate-50",
  AI_ANOMALY_DETECTION: "border-violet-200 bg-violet-50",
  SEASONAL_STOCK_PREP: "border-teal-200 bg-teal-50",
  SENTIMENT_MONITOR: "border-rose-200 bg-rose-50",
  LEAD_SCORE: "border-indigo-200 bg-indigo-50",
  AUTO_VIP_TAG: "border-yellow-300 bg-yellow-50",
  AT_RISK_TAG: "border-orange-300 bg-orange-50",
  HIGH_RETURN_FLAG: "border-red-300 bg-red-50",
};

// ─── Config fields per automation type ────────────────────────────────────────

function ConfigFields({
  type,
  config,
  onChange,
}: {
  type: string;
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  if (type === "SUPPLIER_LOW_STOCK") {
    return (
      <div className="space-y-3">
        <div>
          <Label>حد التنبيه</Label>
          <Select
            value={config.threshold ?? "critical"}
            onValueChange={(v) => onChange("threshold", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">حرج (نفاد المخزون)</SelectItem>
              <SelectItem value="warning">تحذير (قارب النفاد)</SelectItem>
              <SelectItem value="all">أي انخفاض</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="اتركه فارغاً لاستخدام الرسالة التلقائية&#10;المتغيرات: {{supplier_name}} {{product_list}}"
          />
        </div>
      </div>
    );
  }

  if (type === "REENGAGEMENT_AUTO") {
    return (
      <div className="space-y-3">
        <div>
          <Label>عدد أيام التوقف قبل الإرسال</Label>
          <Input
            type="number"
            min={7}
            value={config.inactiveDays ?? 30}
            onChange={(e) => onChange("inactiveDays", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>كود الخصم (اختياري)</Label>
          <Input
            value={config.discountCode ?? ""}
            onChange={(e) => onChange("discountCode", e.target.value)}
            placeholder="مثال: WELCOME10"
            dir="ltr"
          />
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="اتركه فارغاً للنص التلقائي&#10;المتغيرات: {{customer_name}} {{discount_code}}"
          />
        </div>
      </div>
    );
  }

  if (type === "REVIEW_REQUEST") {
    return (
      <div className="space-y-3">
        <div>
          <Label>التأخير بعد التوصيل (ساعات)</Label>
          <Input
            type="number"
            min={1}
            value={config.delayHours ?? 24}
            onChange={(e) => onChange("delayHours", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="اتركه فارغاً للنص التلقائي&#10;المتغيرات: {{customer_name}} {{order_number}}"
          />
        </div>
      </div>
    );
  }

  if (type === "NEW_CUSTOMER_WELCOME") {
    return (
      <div>
        <Label>نص الرسالة المخصص (اختياري)</Label>
        <Textarea
          rows={3}
          value={config.messageTemplate ?? ""}
          onChange={(e) => onChange("messageTemplate", e.target.value)}
          placeholder="اتركه فارغاً للنص التلقائي&#10;المتغيرات: {{customer_name}}"
        />
      </div>
    );
  }

  if (type === "CHURN_PREVENTION") {
    return (
      <div className="space-y-3">
        <div>
          <Label>عدد أيام الصمت (قبل اعتبار العميل معرضاً للخسارة)</Label>
          <Input
            type="number"
            min={14}
            value={config.silentDays ?? 60}
            onChange={(e) => onChange("silentDays", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>كود خصم لإعادة الاستهداف (اختياري)</Label>
          <Input
            value={config.discountCode ?? ""}
            onChange={(e) => onChange("discountCode", e.target.value)}
            placeholder="مثال: BACK20"
            dir="ltr"
          />
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="المتغيرات: {{customer_name}} {{order_count}} {{discount_code}}"
          />
        </div>
      </div>
    );
  }

  if (type === "QUOTE_FOLLOWUP") {
    return (
      <div className="space-y-3">
        <div>
          <Label>عمر العرض قبل إرسال التذكير (ساعات)</Label>
          <Input
            type="number"
            min={1}
            value={config.ageHours ?? 48}
            onChange={(e) => onChange("ageHours", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="المتغيرات: {{customer_name}} {{quote_number}} {{total}}"
          />
        </div>
      </div>
    );
  }

  if (type === "LOYALTY_MILESTONE") {
    return (
      <div className="space-y-3">
        <div>
          <Label>الحد الأدنى من النقاط لإرسال التهنئة</Label>
          <Input
            type="number"
            min={10}
            value={config.milestonePoints ?? 100}
            onChange={(e) =>
              onChange("milestonePoints", Number(e.target.value))
            }
          />
        </div>
        <div>
          <Label>نص الرسالة المخصص (اختياري)</Label>
          <Textarea
            rows={3}
            value={config.messageTemplate ?? ""}
            onChange={(e) => onChange("messageTemplate", e.target.value)}
            placeholder="المتغيرات: {{customer_name}} {{points}} {{tier}}"
          />
        </div>
      </div>
    );
  }

  if (type === "EXPENSE_SPIKE_ALERT") {
    return (
      <div>
        <Label>نسبة الارتفاع الحرج (% فوق المتوسط)</Label>
        <Input
          type="number"
          min={110}
          max={500}
          value={config.spikeThreshold ?? 150}
          onChange={(e) => onChange("spikeThreshold", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          مثال: 150 يعني 50% فوق المتوسط الشهري
        </p>
      </div>
    );
  }

  if (type === "DELIVERY_SLA_BREACH") {
    return (
      <div className="space-y-3">
        <div>
          <Label>مدة SLA (الساعات المسموح بها قبل التنبيه)</Label>
          <Input
            type="number"
            min={12}
            value={config.slaHours ?? 48}
            onChange={(e) => onChange("slaHours", Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="notifyCustomer"
            checked={config.notifyCustomer !== false}
            onChange={(e) => onChange("notifyCustomer", e.target.checked)}
            className="rounded"
          />
          <Label htmlFor="notifyCustomer">أيضاً تنبيه العميل عن التأخير</Label>
        </div>
      </div>
    );
  }

  if (type === "TOKEN_USAGE_WARNING") {
    return (
      <div>
        <Label>نسبة الاستخدام التي تُطلق التنبيه (%)</Label>
        <Input
          type="number"
          min={50}
          max={99}
          value={config.warnPct ?? 80}
          onChange={(e) => onChange("warnPct", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          يرسل تنبيهاً عند الوصول إلى هذه النسبة من حصتك الشهرية
        </p>
      </div>
    );
  }

  if (type === "AI_ANOMALY_DETECTION") {
    return (
      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-violet-50 border border-violet-100">
        <Brain className="w-4 h-4 inline ml-2 text-violet-500" />
        يحلل الذكاء الاصطناعي أرقام أمس مقارنةً بالمتوسط الشهري ويرسل تنبيهاً
        فورياً إذا رصد انحرافاً حرجاً في الإيرادات أو الطلبات. لا يحتاج إعداداً
        إضافياً.
      </div>
    );
  }

  if (type === "SEASONAL_STOCK_PREP") {
    return (
      <div>
        <Label>عدد أيام الإنذار المبكر قبل المناسبة</Label>
        <Input
          type="number"
          min={7}
          max={60}
          value={config.warningDays ?? 14}
          onChange={(e) => onChange("warningDays", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          يتحقق من الأعياد والمناسبات المصرية تلقائياً
        </p>
      </div>
    );
  }

  if (type === "SENTIMENT_MONITOR") {
    return (
      <div>
        <Label>الحد الأدنى لنسبة الشعور السلبي لإطلاق التنبيه (%)</Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={config.frustratedThresholdPct ?? 5}
          onChange={(e) =>
            onChange("frustratedThresholdPct", Number(e.target.value))
          }
        />
      </div>
    );
  }

  if (type === "LEAD_SCORE") {
    return (
      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-indigo-50 border border-indigo-100">
        <Target className="w-4 h-4 inline ml-2 text-indigo-500" />
        يصنّف المحادثات النشطة آلياً إلى: <strong>HOT</strong> (ساخن)،{" "}
        <strong>WARM</strong> (دافئ)، <strong>COLD</strong> (بارد) - بناءً على
        قيمة السلة، عدد الرسائل، وتاريخ الشراء.
      </div>
    );
  }

  if (type === "AUTO_VIP_TAG") {
    return (
      <div className="space-y-3">
        <div>
          <Label>الحد الأدنى لعدد الطلبات المؤكدة</Label>
          <Input
            type="number"
            min={2}
            value={config.minOrders ?? 5}
            onChange={(e) => onChange("minOrders", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>الحد الأدنى لإجمالي الإنفاق (ج.م)</Label>
          <Input
            type="number"
            min={0}
            value={config.minSpend ?? 1000}
            onChange={(e) => onChange("minSpend", Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  if (type === "AT_RISK_TAG") {
    return (
      <div className="space-y-3">
        <div>
          <Label>أيام التوقف التي تعتبر العميل في خطر</Label>
          <Input
            type="number"
            min={7}
            value={config.silentDays ?? 21}
            onChange={(e) => onChange("silentDays", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>أقل عدد طلبات سابقة (لاستهداف العملاء الفعليين فقط)</Label>
          <Input
            type="number"
            min={1}
            value={config.minPriorOrders ?? 2}
            onChange={(e) => onChange("minPriorOrders", Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  if (type === "HIGH_RETURN_FLAG") {
    return (
      <div className="space-y-3">
        <div>
          <Label>نسبة الإلغاء والإرجاع الحرجة (%)</Label>
          <Input
            type="number"
            min={10}
            max={100}
            value={config.cancellationRatePct ?? 30}
            onChange={(e) =>
              onChange("cancellationRatePct", Number(e.target.value))
            }
          />
        </div>
        <div>
          <Label>الحد الأدنى لعدد الطلبات (لتجنب الإيجابيات الكاذبة)</Label>
          <Input
            type="number"
            min={2}
            value={config.minOrders ?? 3}
            onChange={(e) => onChange("minOrders", Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Default intervals ────────────────────────────────────────────────────────

function defaultInterval(type: string): number {
  const map: Record<string, number> = {
    SUPPLIER_LOW_STOCK: 2,
    REVIEW_REQUEST: 24,
    NEW_CUSTOMER_WELCOME: 1,
    REENGAGEMENT_AUTO: 168,
    CHURN_PREVENTION: 168,
    QUOTE_FOLLOWUP: 2,
    LOYALTY_MILESTONE: 1,
    EXPENSE_SPIKE_ALERT: 24,
    DELIVERY_SLA_BREACH: 4,
    TOKEN_USAGE_WARNING: 24,
    AI_ANOMALY_DETECTION: 24,
    SEASONAL_STOCK_PREP: 24,
    SENTIMENT_MONITOR: 24,
    LEAD_SCORE: 24,
    AUTO_VIP_TAG: 24,
    AT_RISK_TAG: 24,
    HIGH_RETURN_FLAG: 24,
  };
  return map[type] ?? 24;
}

const INTERVAL_OPTIONS = [
  { value: 1, label: "كل ساعة" },
  { value: 2, label: "كل ساعتين" },
  { value: 4, label: "كل 4 ساعات" },
  { value: 6, label: "كل 6 ساعات" },
  { value: 12, label: "كل 12 ساعة" },
  { value: 24, label: "يومياً" },
  { value: 48, label: "كل يومين" },
  { value: 168, label: "أسبوعياً" },
];

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationSetting[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [localConfigs, setLocalConfigs] = useState<
    Record<string, Record<string, any>>
  >({});
  const [localIntervals, setLocalIntervals] = useState<Record<string, number>>(
    {},
  );
  const [savingType, setSavingType] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedApi.getAutomations();
      setAutomations(data.automations);
      setLogs(data.recentLogs);
      // Seed local configs
      const cfgs: Record<string, Record<string, any>> = {};
      const intervals: Record<string, number> = {};
      for (const a of data.automations) {
        cfgs[a.type] = { ...a.config };
        intervals[a.type] = a.checkIntervalHours ?? defaultInterval(a.type);
      }
      setLocalConfigs(cfgs);
      setLocalIntervals(intervals);
    } catch (e: any) {
      setError(e?.message ?? "فشل تحميل الأتمتة");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (type: string, current: boolean) => {
    try {
      await authenticatedApi.updateAutomation(type, { isEnabled: !current });
      setAutomations((prev) =>
        prev.map((a) => (a.type === type ? { ...a, isEnabled: !current } : a)),
      );
      toast({
        title: !current ? "تم تفعيل الأتمتة" : "تم إيقاف الأتمتة",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل التحديث",
        description: e?.message,
      });
    }
  };

  const handleSaveConfig = async (type: string) => {
    setSavingType(type);
    try {
      await Promise.all([
        authenticatedApi.updateAutomation(type, { config: localConfigs[type] }),
        authenticatedApi.setAutomationSchedule(
          type,
          localIntervals[type] ?? defaultInterval(type),
        ),
      ]);
      setAutomations((prev) =>
        prev.map((a) =>
          a.type === type
            ? {
                ...a,
                config: { ...localConfigs[type] },
                checkIntervalHours: localIntervals[type],
              }
            : a,
        ),
      );
      toast({ title: "تم حفظ الإعدادات" });
      setExpandedType(null);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: e?.message,
      });
    } finally {
      setSavingType(null);
    }
  };

  const updateConfigKey = (type: string, key: string, value: any) => {
    setLocalConfigs((prev) => ({
      ...prev,
      [type]: { ...(prev[type] ?? {}), [key]: value },
    }));
  };

  // Logs for a specific type
  const logsForType = (type: string) =>
    logs.filter((l) => l.automation_type === type);

  if (loading) {
    return (
      <div dir="rtl" className="space-y-4 p-4 sm:p-6">
        <PageHeader
          title="مركز الأتمتة"
          description="أتمتة الرسائل والتنبيهات التلقائية"
        />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin ml-2" />
          جارٍ التحميل...
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="مركز الأتمتة"
        description="فعّل وعطّل التدفقات التلقائية لرسائل واتساب وأدرها من مكان واحد"
      />

      {/* Toolbar */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="icon"
          className="w-full sm:w-10"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 flex gap-2 items-center text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">
              {automations.filter((a) => a.isEnabled).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">أتمتة مفعّلة</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">
              {logs.reduce((s, l) => s + (l.messages_sent || 0), 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">رسائل أُرسلت</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">
              {logs.filter((l) => l.status === "success").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">تشغيل ناجح</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-red-500">
              {logs.filter((l) => l.status === "error").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">أخطاء</p>
          </CardContent>
        </Card>
      </div>

      {/* Automation Cards */}
      <div className="space-y-4">
        {automations.map((automation) => {
          const isOpen = expandedType === automation.type;
          const typeLogs = logsForType(automation.type);
          const lastLog = typeLogs[0];

          return (
            <Card
              key={automation.type}
              className={`border-2 ${automation.isEnabled ? COLORS[automation.type] || "" : "border-border"}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{ICONS[automation.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">
                        {automation.label}
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={automation.isEnabled ? "default" : "outline"}
                        >
                          {automation.isEnabled ? "مفعّل" : "معطّل"}
                        </Badge>
                        <Switch
                          checked={automation.isEnabled}
                          onCheckedChange={() =>
                            handleToggle(automation.type, automation.isEnabled)
                          }
                        />
                      </div>
                    </div>
                    <CardDescription className="mt-1 text-xs">
                      {automation.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0 space-y-3">
                {/* Last run info */}
                {lastLog && (
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
                    <Clock className="w-3.5 h-3.5" />
                    آخر تشغيل:{" "}
                    {new Date(lastLog.run_at).toLocaleString("ar-SA", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span className="flex items-center gap-1 mr-2">
                      {lastLog.status === "success" ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      )}
                      {lastLog.messages_sent} رسالة من {lastLog.targets_found}
                    </span>
                  </div>
                )}

                {/* Config collapsible */}
                <Collapsible
                  open={isOpen}
                  onOpenChange={() =>
                    setExpandedType(isOpen ? null : automation.type)
                  }
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 h-7 px-2"
                    >
                      <Zap className="w-3 h-3" />
                      تخصيص الإعدادات
                      {isOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="pt-3 border-t mt-3 space-y-4">
                    <ConfigFields
                      type={automation.type}
                      config={localConfigs[automation.type] ?? {}}
                      onChange={(k, v) =>
                        updateConfigKey(automation.type, k, v)
                      }
                    />

                    {/* Schedule interval */}
                    <div className="rounded-lg border border-muted bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          تكرار التشغيل
                        </Label>
                      </div>
                      <Select
                        value={String(
                          localIntervals[automation.type] ??
                            defaultInterval(automation.type),
                        )}
                        onValueChange={(v) =>
                          setLocalIntervals((prev) => ({
                            ...prev,
                            [automation.type]: Number(v),
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERVAL_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={String(opt.value)}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        المحرك يعمل كل ساعة ويتحقق إذا حان الوقت المحدد
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => setExpandedType(null)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => handleSaveConfig(automation.type)}
                        disabled={savingType === automation.type}
                      >
                        {savingType === automation.type ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />
                        ) : null}
                        حفظ الإعدادات
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent run log table */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">سجل التشغيل الأخير</CardTitle>
          </CardHeader>
          <CardContent>
            <>
              <div className="space-y-3 md:hidden">
                {logs.slice(0, 15).map((log, i) => {
                  const aut = automations.find(
                    (a) => a.type === log.automation_type,
                  );
                  return (
                    <div key={i} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {aut?.label ?? log.automation_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.run_at).toLocaleString("ar-SA", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {log.status === "success" ? (
                          <Badge
                            variant="outline"
                            className="text-green-700 border-green-300"
                          >
                            <CheckCircle className="w-3 h-3 ml-1" />
                            نجح
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-red-700 border-red-300"
                          >
                            <XCircle className="w-3 h-3 ml-1" />
                            خطأ
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">أُرسل</p>
                          <p className="font-medium">{log.messages_sent}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            المستهدفون
                          </p>
                          <p className="font-medium">{log.targets_found}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="pb-2 pr-0">النوع</th>
                      <th className="pb-2">الحالة</th>
                      <th className="pb-2">أُرسل</th>
                      <th className="pb-2">المستهدفون</th>
                      <th className="pb-2">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 15).map((log, i) => {
                      const aut = automations.find(
                        (a) => a.type === log.automation_type,
                      );
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-0 font-medium">
                            {aut?.label ?? log.automation_type}
                          </td>
                          <td className="py-2">
                            {log.status === "success" ? (
                              <Badge
                                variant="outline"
                                className="text-green-700 border-green-300"
                              >
                                <CheckCircle className="w-3 h-3 ml-1" />
                                نجح
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-red-700 border-red-300"
                              >
                                <XCircle className="w-3 h-3 ml-1" />
                                خطأ
                              </Badge>
                            )}
                          </td>
                          <td className="py-2">{log.messages_sent}</td>
                          <td className="py-2">{log.targets_found}</td>
                          <td className="py-2 text-muted-foreground text-xs">
                            {new Date(log.run_at).toLocaleString("ar-SA", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
