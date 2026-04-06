"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bot,
  Package,
  CreditCard,
  Megaphone,
  HeadphonesIcon,
  Zap,
  BarChart3,
  Palette,
  Rocket,
  AlertCircle,
  RefreshCw,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Link2,
  AlertTriangle,
  Ban,
  Eye,
  ClipboardList,
  Users,
  Download,
  Printer,
  Copy,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";

interface TeamTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  agents: string[];
  subtasksCount: number;
  subtasks: Array<{
    agentType: string;
    descriptionAr: string;
    descriptionEn: string;
    hasDependencies: boolean;
  }>;
  isAvailable: boolean;
  missingAgents: string[];
}

interface TeamTask {
  id: string;
  titleAr: string;
  titleEn: string;
  status: string;
  strategy: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  };
  failureReasons?: string[];
  completionSummaries?: string[];
  resultSummaryAr?: string | null;
  reportSource?: "agent_output" | "raw";
  createdAt: string;
  completedAt: string | null;
}

interface TeamTaskDetails extends TeamTask {
  subtasks?: Array<Record<string, any>>;
  aggregatedResult?: Record<string, any> | null;
  replyAr?: string | null;
  reportText?: string | null;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  OPS_AGENT: Bot,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: CreditCard,
  MARKETING_AGENT: Megaphone,
  SUPPORT_AGENT: HeadphonesIcon,
  CONTENT_AGENT: Zap,
  SALES_AGENT: BarChart3,
  CREATIVE_AGENT: Palette,
};

const AGENT_NAMES_AR: Record<string, string> = {
  OPS_AGENT: "العمليات",
  INVENTORY_AGENT: "المخزون",
  FINANCE_AGENT: "المالية",
  MARKETING_AGENT: "التسويق",
  SUPPORT_AGENT: "الدعم",
  CONTENT_AGENT: "المحتوى",
  SALES_AGENT: "المبيعات",
  CREATIVE_AGENT: "الإبداع",
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ElementType;
  }
> = {
  PLANNING: {
    label: "جاري التخطيط",
    variant: "secondary",
    icon: ClipboardList,
  },
  DISPATCHING: { label: "جاري التوزيع", variant: "secondary", icon: Play },
  RUNNING: { label: "قيد التنفيذ", variant: "default", icon: Loader2 },
  AGGREGATING: { label: "جاري التجميع", variant: "secondary", icon: Link2 },
  COMPLETED: { label: "مكتمل", variant: "default", icon: CheckCircle },
  PARTIAL: { label: "مكتمل جزئياً", variant: "outline", icon: AlertTriangle },
  FAILED: { label: "فشل", variant: "destructive", icon: XCircle },
  CANCELLED: { label: "ملغى", variant: "outline", icon: Ban },
};

export default function AgentTeamsPage() {
  const { apiKey } = useMerchant();
  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [selectedTaskDetails, setSelectedTaskDetails] =
    useState<TeamTaskDetails | null>(null);
  const [detailsLoadingTaskId, setDetailsLoadingTaskId] = useState<
    string | null
  >(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const ACTIVE_STATUSES = new Set([
    "PLANNING",
    "DISPATCHING",
    "RUNNING",
    "AGGREGATING",
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesData, tasksData] = await Promise.all([
        merchantApi.getTeamTemplates(apiKey).catch(() => ({
          templates: [],
          totalAvailable: 0,
          totalTemplates: 0,
        })),
        merchantApi
          .listTeamTasks(apiKey)
          .catch(() => ({ tasks: [], total: 0 })),
      ]);

      setTemplates(templatesData.templates || []);
      setTasks(tasksData.tasks || []);
    } catch (err) {
      console.error("Failed to fetch team data:", err);
      setError("فشل في تحميل بيانات الفرق");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const hasActiveTask = tasks.some((task) =>
      ACTIVE_STATUSES.has(task.status),
    );
    if (!hasActiveTask) return;
    const timer = setInterval(() => {
      fetchData();
    }, 8000);
    return () => clearInterval(timer);
  }, [tasks, fetchData]);

  const openTaskDetails = async (task: TeamTask) => {
    setDetailsError(null);
    setSelectedTaskDetails(null);
    setDetailsLoadingTaskId(task.id);
    try {
      const data = await merchantApi
        .getTeamTaskReport(apiKey, task.id, "json")
        .catch(() => merchantApi.getTeamTaskStatus(apiKey, task.id));
      setSelectedTaskDetails({
        ...task,
        ...data,
      });
    } catch (err) {
      console.error("Failed to fetch team task details:", err);
      setDetailsError("تعذر تحميل تفاصيل التقرير الآن");
    } finally {
      setDetailsLoadingTaskId(null);
    }
  };

  const closeTaskDetailsDialog = (open: boolean) => {
    if (open) return;
    setSelectedTaskDetails(null);
    setDetailsError(null);
  };

  const formatPrettyJson = (value: unknown): string => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? "");
    }
  };

  const detailSubtasks = Array.isArray(selectedTaskDetails?.subtasks)
    ? selectedTaskDetails.subtasks
    : [];

  const formatDateTime = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const subtaskStatusLabel = (status: unknown): string => {
    const upper = String(status || "").toUpperCase();
    if (upper === "COMPLETED") return "تم بنجاح";
    if (upper === "FAILED") return "فشل";
    if (upper === "SKIPPED") return "تم التخطي";
    if (upper === "RUNNING") return "قيد التنفيذ";
    if (upper === "PENDING") return "بانتظار التنفيذ";
    return upper || "غير معروف";
  };

  const buildTaskReportText = (task: TeamTaskDetails): string => {
    if (
      typeof task.reportText === "string" &&
      task.reportText.trim().length > 0
    ) {
      return task.reportText.trim();
    }

    const lines: string[] = [];
    const status = STATUS_CONFIG[task.status]?.label || task.status;
    const total = Number(task.progress?.total || 0);
    const completed = Number(task.progress?.completed || 0);
    const failed = Number(task.progress?.failed || 0);

    lines.push(`# ${task.titleAr || "تقرير جماعي"}`);
    lines.push("");
    lines.push(`الحالة: ${status}`);
    lines.push(`التقدم: ${completed}/${total} (فشل: ${failed})`);
    lines.push(
      `مصدر التقرير: ${task.reportSource === "agent_output" ? "مخرجات نصية مباشرة من الوكلاء" : "بيانات تشغيل خام فقط (بدون تحليل AI نصي)"}`,
    );
    lines.push(`بدأت المهمة: ${formatDateTime(task.createdAt)}`);
    lines.push(`انتهت المهمة: ${formatDateTime(task.completedAt)}`);
    lines.push("");

    const summary = String(task.resultSummaryAr || "").trim();
    if (summary.length > 0) {
      lines.push("## الملخص التنفيذي");
      lines.push(summary);
      lines.push("");
    } else {
      lines.push("## الملخص التنفيذي");
      lines.push(
        "لا يوجد تحليل AI نصي محفوظ لهذه المهمة. يمكنك مراجعة ناتج الوكلاء الخام.",
      );
      lines.push("");
    }

    if (Array.isArray(task.failureReasons) && task.failureReasons.length > 0) {
      lines.push("## أسباب الفشل");
      task.failureReasons.forEach((reason, idx) => {
        lines.push(`${idx + 1}. ${String(reason || "").trim()}`);
      });
      lines.push("");
    }

    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      lines.push("## تفاصيل المهام الفرعية");
      task.subtasks.forEach((subtask, idx) => {
        lines.push(
          `${idx + 1}. ${String(subtask.descriptionAr || subtask.description || subtask.taskType || "مهمة فرعية")}`,
        );
        lines.push(`   - الحالة: ${subtaskStatusLabel(subtask.status)}`);

        const output =
          subtask?.output && typeof subtask.output === "object"
            ? subtask.output
            : null;
        if (output) {
          lines.push("   - المخرجات (Raw):");
          formatPrettyJson(output)
            .split("\n")
            .forEach((line) => {
              lines.push(`     ${line}`);
            });
        }

        if (subtask?.error) {
          lines.push(`   - الخطأ: ${String(subtask.error)}`);
        }

        lines.push("");
      });
    }

    if (task.aggregatedResult) {
      lines.push("## الناتج الخام (JSON)");
      lines.push(formatPrettyJson(task.aggregatedResult));
      lines.push("");
    }

    lines.push(
      `تاريخ إنشاء التقرير: ${formatDateTime(new Date().toISOString())}`,
    );
    return lines.join("\n").trim();
  };

  const buildPrintableReportHtml = (
    task: TeamTaskDetails,
    reportText: string,
  ): string => {
    const safeTitle = (task.titleAr || "تقرير جماعي")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safeBody = reportText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; background: #fff; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    pre { white-space: pre-wrap; line-height: 1.8; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .meta { color: #64748b; margin-bottom: 12px; font-size: 12px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div class="meta">تم التوليد من مهمة الوكلاء الجماعية</div>
  <pre>${safeBody}</pre>
</body>
</html>`;
  };

  const downloadTaskReportText = () => {
    if (!selectedTaskDetails) return;
    const filenameSafeTitle = (selectedTaskDetails.titleAr || "team-report")
      .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${filenameSafeTitle || "team-report"}-${selectedTaskDetails.id}.txt`;

    merchantApi
      .downloadTeamTaskReport(apiKey, selectedTaskDetails.id, "txt")
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        const strictReportText =
          typeof selectedTaskDetails.reportText === "string"
            ? selectedTaskDetails.reportText.trim()
            : "";
        if (!strictReportText) {
          setDetailsError(
            "تعذر تنزيل التقرير من الخادم، ولا يوجد تقرير نصي AI محفوظ محلياً.",
          );
          return;
        }
        const blob = new Blob([strictReportText], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
  };

  const printTaskReportAsPdf = () => {
    if (!selectedTaskDetails) return;
    const openAndPrint = (html: string) => {
      const popup = window.open(
        "",
        "_blank",
        "noopener,noreferrer,width=1100,height=800",
      );
      if (!popup) return;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => {
        popup.print();
      }, 250);
    };

    merchantApi
      .downloadTeamTaskReport(apiKey, selectedTaskDetails.id, "html")
      .then(async (blob) => {
        const html = await blob.text();
        openAndPrint(html);
      })
      .catch(() => {
        const strictReportText =
          typeof selectedTaskDetails.reportText === "string"
            ? selectedTaskDetails.reportText.trim()
            : "";
        if (!strictReportText) {
          setDetailsError(
            "تعذر فتح نسخة الطباعة من الخادم، ولا يوجد تقرير نصي AI محفوظ.",
          );
          return;
        }
        const html = buildPrintableReportHtml(
          selectedTaskDetails,
          strictReportText,
        );
        openAndPrint(html);
      });
  };

  const copyTaskReportText = async () => {
    if (!selectedTaskDetails) return;
    const text = buildTaskReportText(selectedTaskDetails);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op: browser may block clipboard in insecure context
    }
  };

  const executeTemplate = async (templateId: string) => {
    setExecuting(templateId);
    setMessage(null);
    try {
      const data = await merchantApi.executeTeamTemplate(apiKey, templateId, {
        priority: "MEDIUM",
      });
      setMessage({ text: data.message || "تم إطلاق المهمة!", type: "success" });
      fetchData();
    } catch (err: any) {
      const errorMsg = err?.message || err?.error || "";
      const isQuotaError =
        typeof errorMsg === "string" &&
        (errorMsg.includes("AI_QUOTA_EXHAUSTED") ||
          errorMsg.includes("AI_LIMIT_EXCEEDED") ||
          errorMsg.includes("AI_NOT_ENABLED") ||
          errorMsg.includes("AI_TEMPORARILY_UNAVAILABLE") ||
          errorMsg.includes("Token budget exceeded") ||
          errorMsg.includes("budget"));
      if (isQuotaError) {
        setMessage({ text: "AI_QUOTA", type: "error" });
      } else {
        setMessage({ text: "خطأ في الاتصال بالخادم", type: "error" });
      }
    } finally {
      setExecuting(null);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="المهام الجماعية للوكلاء"
          description="توزيع المهام على عدة وكلاء للعمل بالتوازي"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="المهام الجماعية للوكلاء"
          description="توزيع المهام على عدة وكلاء للعمل بالتوازي"
        />
        <Card className="mt-6">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">{error}</p>
            <Button onClick={fetchData} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="المهام الجماعية للوكلاء"
        description="بدلاً من أن يعمل وكيل واحد على تنفيذ المهام بشكل تسلسلي، يمكن توزيع العمل على عدة وكلاء"
        actions={
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
        }
      />

      {/* Message */}
      {message && (
        <Card
          className={
            message.type === "success"
              ? "border-green-500/50 bg-green-50 dark:bg-green-950/20"
              : "border-destructive/50 bg-red-50 dark:bg-red-950/20"
          }
        >
          <CardContent className="p-4 flex items-center gap-3">
            {message.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
            )}
            <p
              className={
                message.type === "success"
                  ? "text-green-700 dark:text-green-300"
                  : "text-destructive flex-1"
              }
            >
              {message.text === "AI_QUOTA"
                ? "تم استنفاد رصيد الذكاء الاصطناعي اليومي. يتم التجديد يومياً أو قم بترقية الباقة."
                : message.text}
            </p>
            {message.text === "AI_QUOTA" && (
              <a
                href="/merchant/plan"
                className="shrink-0 text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
              >
                ترقية الباقة
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Templates */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          المهام الجماعية المتاحة
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={
                template.isAvailable
                  ? "hover:border-primary/50 transition-colors"
                  : "opacity-60"
              }
            >
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-foreground text-lg">
                      {template.nameAr}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.descriptionAr}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {template.subtasksCount} مهام فرعية
                  </Badge>
                </div>

                {/* Agents involved */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {template.agents.map((agent) => {
                    const AgentIcon = AGENT_ICONS[agent] || Bot;
                    const isMissing = template.missingAgents.includes(agent);
                    return (
                      <Badge
                        key={agent}
                        variant={isMissing ? "destructive" : "outline"}
                        className="gap-1"
                      >
                        <AgentIcon className="h-3 w-3" />
                        {AGENT_NAMES_AR[agent]}
                        {isMissing && " (غير مفعل)"}
                      </Badge>
                    );
                  })}
                </div>

                {/* Subtasks */}
                <div className="space-y-1.5 mb-4">
                  {template.subtasks.map((st, i) => {
                    const SubIcon = AGENT_ICONS[st.agentType] || Bot;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <SubIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{st.descriptionAr}</span>
                        {st.hasDependencies && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            <Link2 className="h-2.5 w-2.5 ml-0.5" />
                            يعتمد على مهمة سابقة
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Execute button */}
                <Button
                  onClick={() => executeTemplate(template.id)}
                  disabled={!template.isAvailable || executing === template.id}
                  className="w-full"
                  variant={template.isAvailable ? "default" : "secondary"}
                >
                  {executing === template.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      جاري التنفيذ...
                    </>
                  ) : template.isAvailable ? (
                    <>
                      <Rocket className="h-4 w-4 ml-2" />
                      تنفيذ
                    </>
                  ) : (
                    `يحتاج تفعيل: ${template.missingAgents.map((a) => AGENT_NAMES_AR[a]).join("، ")}`
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Tasks */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          المهام الجماعية الأخيرة
        </h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground">
                لا توجد مهام جماعية بعد
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                اختر مهمة جماعية من القائمة أعلاه لبدء التنفيذ
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const config =
                STATUS_CONFIG[task.status] || STATUS_CONFIG.RUNNING;
              const StatusIcon = config.icon;
              const totalSubtasks = Number(task.progress?.total || 0);
              const completedSubtasks = Number(task.progress?.completed || 0);
              const failedSubtasks = Number(task.progress?.failed || 0);
              const successStatuses = new Set(["COMPLETED", "PARTIAL"]);
              const isSuccessfulTask = successStatuses.has(task.status);
              const computedPercent =
                totalSubtasks > 0
                  ? Math.round(
                      ((completedSubtasks + failedSubtasks) / totalSubtasks) *
                        100,
                    )
                  : 0;
              const progressPercent = Number.isFinite(
                Number(task.progress?.percent),
              )
                ? Number(task.progress?.percent)
                : computedPercent;
              const completionSummaries = Array.isArray(
                task.completionSummaries,
              )
                ? task.completionSummaries
                    .map((entry) => String(entry || "").trim())
                    .filter((entry) => entry.length > 0)
                : [];
              const resultSummary =
                typeof task.resultSummaryAr === "string"
                  ? task.resultSummaryAr.trim()
                  : "";
              return (
                <Card
                  key={task.id}
                  className="hover:border-primary/30 transition-colors"
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <StatusIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {task.titleAr}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(task.createdAt).toLocaleDateString(
                              "ar-EG",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <Progress
                        value={progressPercent}
                        className="h-2 flex-1"
                      />
                      <span className="text-sm text-muted-foreground tabular-nums min-w-[60px] text-start">
                        {completedSubtasks}/{totalSubtasks}
                      </span>
                    </div>

                    {failedSubtasks > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {failedSubtasks} مهام فرعية فشلت
                        </p>
                        {Array.isArray(task.failureReasons) &&
                          task.failureReasons.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {task.failureReasons
                                .slice(0, 3)
                                .map((reason, idx) => (
                                  <p
                                    key={`${task.id}-failure-${idx}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    سبب الفشل: {reason}
                                  </p>
                                ))}
                            </div>
                          )}
                      </div>
                    )}

                    {isSuccessfulTask && (
                      <div className="mt-2 rounded-md border border-green-200/70 bg-green-50/40 px-2.5 py-2">
                        <p className="text-xs font-medium text-green-700">
                          ملخص التنفيذ
                        </p>
                        {resultSummary.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                            {resultSummary}
                          </p>
                        )}
                        {resultSummary.length === 0 &&
                          completionSummaries.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {completionSummaries
                                .slice(0, 3)
                                .map((entry, idx) => (
                                  <p
                                    key={`${task.id}-summary-${idx}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    {entry}
                                  </p>
                                ))}
                            </div>
                          )}
                        {resultSummary.length === 0 &&
                          completionSummaries.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              تم التنفيذ، لكن لا يوجد ملخص AI نصي محفوظ.
                            </p>
                          )}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          مصدر الملخص:{" "}
                          {task.reportSource === "agent_output"
                            ? "مخرجات الوكلاء"
                            : "بيانات تشغيل خام (بدون تحليل AI نصي)"}
                        </p>
                      </div>
                    )}

                    {!ACTIVE_STATUSES.has(task.status) && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTaskDetails(task)}
                          disabled={detailsLoadingTaskId === task.id}
                          className="gap-1.5"
                        >
                          {detailsLoadingTaskId === task.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              جاري التحميل...
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              {isSuccessfulTask
                                ? "عرض التقرير الكامل"
                                : "عرض التفاصيل"}
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {ACTIVE_STATUSES.has(task.status) && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        يتم تحديث التقدم تلقائياً كل عدة ثوانٍ
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedTaskDetails || !!detailsError}
        onOpenChange={closeTaskDetailsDialog}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedTaskDetails?.titleAr || "تفاصيل التقرير"}
            </DialogTitle>
            <DialogDescription>
              يعرض هذا التقرير نتيجة الوكلاء بالتفصيل من نفس المهمة الجماعية.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pe-1">
            {!!selectedTaskDetails && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={downloadTaskReportText}
                >
                  <Download className="h-3.5 w-3.5" />
                  تنزيل نص التقرير
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={printTaskReportAsPdf}
                >
                  <Printer className="h-3.5 w-3.5" />
                  طباعة / PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={copyTaskReportText}
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ التقرير
                </Button>
              </div>
            )}

            {detailsError && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-3 text-sm text-destructive">
                  {detailsError}
                </CardContent>
              </Card>
            )}

            {selectedTaskDetails && (
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">التقرير النصي الكامل</p>
                    <Badge
                      variant={
                        selectedTaskDetails.reportSource === "agent_output"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {selectedTaskDetails.reportSource === "agent_output"
                        ? "مخرجات وكلاء"
                        : "بيانات خام"}
                    </Badge>
                  </div>
                  <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-start">
                    {buildTaskReportText(selectedTaskDetails)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {selectedTaskDetails?.aggregatedResult && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">ناتج الوكلاء (Raw)</p>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto text-start">
                    {formatPrettyJson(selectedTaskDetails.aggregatedResult)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {detailSubtasks.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">
                    تفاصيل المهام الفرعية
                  </p>
                  <div className="space-y-2">
                    {detailSubtasks.map((subtask: Record<string, any>) => (
                      <div
                        key={String(subtask.id)}
                        className="rounded-md border p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium">
                            {String(
                              subtask.descriptionAr ||
                                subtask.description ||
                                subtask.taskType ||
                                "مهمة فرعية",
                            )}
                          </p>
                          <Badge
                            variant={
                              String(subtask.status || "").toUpperCase() ===
                              "COMPLETED"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {String(subtask.status || "").toUpperCase() ===
                            "COMPLETED"
                              ? "تم"
                              : String(subtask.status || "-")}
                          </Badge>
                        </div>
                        {subtask?.output && (
                          <pre className="mt-2 rounded bg-muted p-2 text-[11px] overflow-x-auto text-start">
                            {formatPrettyJson(subtask.output)}
                          </pre>
                        )}
                        {subtask?.error && (
                          <p className="mt-2 text-xs text-destructive">
                            {String(subtask.error)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!detailsError &&
              !selectedTaskDetails?.reportText &&
              !selectedTaskDetails?.aggregatedResult &&
              detailSubtasks.length === 0 && (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    لا توجد بيانات تفصيلية محفوظة لهذه المهمة حتى الآن.
                  </CardContent>
                </Card>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
