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
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  Search,
  Filter,
  Trash2,
  Pencil,
  Eye,
  Loader2,
  Megaphone,
  Target,
  RefreshCw,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/client";

// ─── Types ────────────────────────────────────────────────────────
interface SegmentRule {
  field: string;
  operator: string;
  value: string;
}

interface CustomSegment {
  id: string;
  name: string;
  description: string;
  rules: SegmentRule[];
  match_type: "all" | "any";
  customer_count: number;
  created_at: string;
}

interface PreviewCustomer {
  name: string;
  phone: string;
  order_count: number;
  total_spent: number;
  last_order: string;
}

// ─── Constants ────────────────────────────────────────────────────
const RULE_FIELDS = [
  { value: "order_count", label: "عدد الطلبات", type: "number" },
  { value: "total_spent", label: "إجمالي الإنفاق (ج.م)", type: "number" },
  { value: "days_since_last_order", label: "أيام منذ آخر طلب", type: "number" },
  { value: "avg_order_value", label: "متوسط قيمة الطلب (ج.م)", type: "number" },
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  number: [
    { value: "gte", label: "≥ أكبر من أو يساوي" },
    { value: "lte", label: "≤ أقل من أو يساوي" },
    { value: "gt", label: "> أكبر من" },
    { value: "lt", label: "< أقل من" },
    { value: "eq", label: "= يساوي" },
  ],
};

const PRESET_SEGMENTS: {
  name: string;
  description: string;
  rules: SegmentRule[];
  match_type: "all" | "any";
}[] = [
  {
    name: "عملاء VIP",
    description: "عملاء بأكثر من 5 طلبات وإنفاق أكثر من 1000 ج.م",
    match_type: "all",
    rules: [
      { field: "order_count", operator: "gte", value: "5" },
      { field: "total_spent", operator: "gte", value: "1000" },
    ],
  },
  {
    name: "عملاء في خطر",
    description: "عملاء لم يطلبوا منذ 60 يوم ولديهم 3+ طلبات سابقة",
    match_type: "all",
    rules: [
      { field: "days_since_last_order", operator: "gte", value: "60" },
      { field: "order_count", operator: "gte", value: "3" },
    ],
  },
  {
    name: "عملاء بقيمة طلب عالية",
    description: "متوسط قيمة طلبهم أكثر من 500 ج.م",
    match_type: "all",
    rules: [{ field: "avg_order_value", operator: "gte", value: "500" }],
  },
  {
    name: "عملاء جدد نشطون",
    description: "طلب واحد على الأقل وآخر طلب منذ أقل من 7 أيام",
    match_type: "all",
    rules: [
      { field: "order_count", operator: "gte", value: "1" },
      { field: "days_since_last_order", operator: "lte", value: "7" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────
const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);
const fmt = (v: unknown) => num(v).toLocaleString("ar-EG");

function getFieldLabel(field: string) {
  return RULE_FIELDS.find((f) => f.value === field)?.label || field;
}
function getOperatorLabel(op: string) {
  return OPERATORS.number?.find((o) => o.value === op)?.label || op;
}

// ─── Component ────────────────────────────────────────────────────
export default function CustomerSegmentsPage() {
  // Segments list
  const [segments, setSegments] = useState<CustomSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create / Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchType, setMatchType] = useState<"all" | "any">("all");
  const [rules, setRules] = useState<SegmentRule[]>([
    { field: "order_count", operator: "gte", value: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview
  const [previewSegment, setPreviewSegment] = useState<CustomSegment | null>(
    null,
  );
  const [previewCustomers, setPreviewCustomers] = useState<PreviewCustomer[]>(
    [],
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Broadcast to segment
  const [broadcastSegment, setBroadcastSegment] =
    useState<CustomSegment | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState<
    "promotional" | "reminder" | "update"
  >("promotional");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    sentCount: number;
    failCount: number;
    recipientCount: number;
  } | null>(null);

  // ─── Fetch segments ───────────────────────────────────────────
  const fetchSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedFetch("/api/v1/portal/custom-segments");
      const list = (data as any)?.segments || [];
      setSegments(list);
    } catch {
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  // ─── Save segment ─────────────────────────────────────────────
  const handleSave = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("اسم الشريحة مطلوب");
      return;
    }
    const validRules = rules.filter((r) => r.field && r.operator && r.value);
    if (validRules.length === 0) {
      setFormError("أضف قاعدة واحدة على الأقل بقيمة");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name,
        description,
        match_type: matchType,
        rules: validRules,
      };
      if (editingId) {
        await authenticatedFetch(
          `/api/v1/portal/custom-segments/${editingId}`,
          {
            method: "PUT",
            body,
          },
        );
      } else {
        await authenticatedFetch("/api/v1/portal/custom-segments", {
          method: "POST",
          body,
        });
      }
      setShowDialog(false);
      resetForm();
      fetchSegments();
    } catch (err: any) {
      setFormError(err?.message || "فشل حفظ الشريحة");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete segment ───────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await authenticatedFetch(`/api/v1/portal/custom-segments/${deleteId}`, {
        method: "DELETE",
      });
      setDeleteId(null);
      fetchSegments();
    } catch (err: any) {
      setError(err?.message || "فشل حذف الشريحة");
    } finally {
      setDeleting(false);
    }
  };

  // ─── Broadcast to segment ─────────────────────────────────────
  const handleBroadcast = async () => {
    if (!broadcastSegment || !broadcastTitle.trim() || !broadcastMessage.trim())
      return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const result: any = await authenticatedFetch(
        "/api/v1/portal/notifications/broadcast",
        {
          method: "POST",
          body: {
            title: broadcastTitle,
            message: broadcastMessage,
            type: broadcastType,
            customSegmentId: broadcastSegment.id,
          },
        },
      );
      setBroadcastResult({
        sentCount: result.sentCount || 0,
        failCount: result.failCount || 0,
        recipientCount: result.recipientCount || 0,
      });
    } catch (err: any) {
      setError(err?.message || "فشل إرسال الرسالة للشريحة");
      setBroadcastSegment(null);
    } finally {
      setBroadcasting(false);
    }
  };

  const openBroadcastDialog = (seg: CustomSegment) => {
    setBroadcastSegment(seg);
    setBroadcastTitle("");
    setBroadcastMessage("");
    setBroadcastType("promotional");
    setBroadcastResult(null);
  };

  // ─── Preview segment ──────────────────────────────────────────
  const handlePreview = async (segment: CustomSegment) => {
    setPreviewSegment(segment);
    setPreviewLoading(true);
    setPreviewCustomers([]);
    setPreviewCount(0);
    try {
      const data: any = await authenticatedFetch(
        `/api/v1/portal/custom-segments/${segment.id}/preview`,
      );
      setPreviewCustomers(data.customers || []);
      setPreviewCount(data.total || 0);
    } catch {
      setPreviewCustomers([]);
      setPreviewCount(num(segment.customer_count));
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─── Form helpers ─────────────────────────────────────────────
  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setMatchType("all");
    setRules([{ field: "order_count", operator: "gte", value: "" }]);
    setFormError(null);
  };

  const openEdit = (seg: CustomSegment) => {
    setEditingId(seg.id);
    setName(seg.name);
    setDescription(seg.description || "");
    setMatchType(seg.match_type || "all");
    setRules(
      seg.rules?.length
        ? seg.rules
        : [{ field: "order_count", operator: "gte", value: "" }],
    );
    setFormError(null);
    setShowDialog(true);
  };

  const openCreateFromPreset = (preset: (typeof PRESET_SEGMENTS)[number]) => {
    resetForm();
    setName(preset.name);
    setDescription(preset.description);
    setMatchType(preset.match_type);
    setRules([...preset.rules]);
    setShowDialog(true);
  };

  const addRule = () => {
    setRules([...rules, { field: "order_count", operator: "gte", value: "" }]);
  };

  const removeRule = (idx: number) => {
    if (rules.length <= 1) return;
    setRules(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, key: keyof SegmentRule, val: string) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], [key]: val };
    setRules(updated);
  };

  // ─── Filtered list ────────────────────────────────────────────
  const filtered = segments.filter(
    (s) =>
      (s.name || "").includes(search) || (s.description || "").includes(search),
  );

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="شرائح العملاء المخصصة"
        description="أنشئ شرائح بقواعد ذكية لاستهداف العملاء في حملاتك التسويقية"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={fetchSegments}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                resetForm();
                setShowDialog(true);
              }}
            >
              <Plus className="h-4 w-4 ml-2" />
              شريحة جديدة
            </Button>
          </div>
        }
      />

      {/* AI Segment Insights */}
      {/* ─── Presets (empty state) ───────────────────────────── */}
      {segments.length === 0 && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              ابدأ بشريحة جاهزة
            </CardTitle>
            <CardDescription>
              اختر من القوالب الجاهزة أو أنشئ شريحة مخصصة من الصفر
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_SEGMENTS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => openCreateFromPreset(preset)}
                  className="text-right p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors group"
                >
                  <p className="font-medium group-hover:text-primary">
                    {preset.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {preset.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {preset.rules.map((r, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {getFieldLabel(r.field)} {getOperatorLabel(r.operator)}{" "}
                        {r.value}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Search bar ──────────────────────────────────────── */}
      {segments.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث في الشرائح..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ─── Segments table ──────────────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : segments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>الشرائح المخصصة ({segments.length})</CardTitle>
            <CardDescription>
              انقر على معاينة لرؤية العملاء المطابقين أو استهدفهم في حملة
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {filtered.length === 0 ? (
                <div className="rounded-lg border py-8 text-center text-muted-foreground">
                  لا توجد شرائح مطابقة للبحث
                </div>
              ) : (
                filtered.map((seg, idx) => (
                  <div
                    key={seg.id || `seg-mobile-${idx}`}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{seg.name || "-"}</p>
                        {seg.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {seg.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="default">{fmt(seg.customer_count)}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(seg.rules || []).slice(0, 3).map((r, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {getFieldLabel(r.field)}{" "}
                          {getOperatorLabel(r.operator)} {r.value}
                        </Badge>
                      ))}
                      {(seg.rules || []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{seg.rules.length - 3}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {seg.match_type === "all" ? "كل" : "أي"}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => handlePreview(seg)}
                      >
                        <Eye className="ml-1 h-4 w-4" />
                        معاينة
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-green-600 hover:text-green-800 sm:w-auto"
                        onClick={() => openBroadcastDialog(seg)}
                      >
                        <Megaphone className="ml-1 h-4 w-4" />
                        إرسال
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => openEdit(seg)}
                      >
                        <Pencil className="ml-1 h-4 w-4" />
                        تعديل
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-red-500 hover:text-red-700 sm:w-auto"
                        onClick={() => setDeleteId(seg.id)}
                      >
                        <Trash2 className="ml-1 h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الشريحة</TableHead>
                    <TableHead className="text-right">القواعد</TableHead>
                    <TableHead className="text-center">العملاء</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        لا توجد شرائح مطابقة للبحث
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((seg, idx) => (
                      <TableRow key={seg.id || `seg-${idx}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{seg.name || "-"}</p>
                            {seg.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {seg.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(seg.rules || []).slice(0, 3).map((r, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
                                {getFieldLabel(r.field)}{" "}
                                {getOperatorLabel(r.operator)} {r.value}
                              </Badge>
                            ))}
                            {(seg.rules || []).length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{seg.rules.length - 3}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {seg.match_type === "all" ? "كل" : "أي"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default">
                            {fmt(seg.customer_count)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(seg)}
                              title="معاينة"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openBroadcastDialog(seg)}
                              title="إرسال رسالة للشريحة"
                              className="text-green-600 hover:text-green-800"
                            >
                              <Megaphone className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(seg)}
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(seg.id)}
                              title="حذف"
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════
          CREATE / EDIT DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDialog(false);
            resetForm();
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل الشريحة" : "شريحة مخصصة جديدة"}
            </DialogTitle>
            <DialogDescription>
              حدد القواعد لاختيار العملاء المستهدفين تلقائياً
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>اسم الشريحة *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: عملاء VIP القاهرة"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>الوصف</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف اختياري"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Match type */}
            <div>
              <Label>طريقة المطابقة</Label>
              <Select
                value={matchType}
                onValueChange={(v: string) => setMatchType(v as "all" | "any")}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    كل القواعد (AND) - العميل يطابق جميع الشروط
                  </SelectItem>
                  <SelectItem value="any">
                    أي قاعدة (OR) - العميل يطابق شرط واحد على الأقل
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Rules */}
            <div>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  القواعد ({rules.length})
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addRule}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-3 w-3 ml-1" />
                  إضافة قاعدة
                </Button>
              </div>
              <div className="space-y-2">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center"
                  >
                    {idx > 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {matchType === "all" ? "و" : "أو"}
                      </Badge>
                    )}

                    {/* Field */}
                    <Select
                      value={rule.field}
                      onValueChange={(v) => updateRule(idx, "field", v)}
                    >
                      <SelectTrigger className="w-full sm:w-[175px]">
                        <SelectValue placeholder="الحقل" />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator */}
                    <Select
                      value={rule.operator}
                      onValueChange={(v) => updateRule(idx, "operator", v)}
                    >
                      <SelectTrigger className="w-full sm:w-[160px]">
                        <SelectValue placeholder="الشرط" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.number.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value */}
                    <Input
                      type="number"
                      value={rule.value}
                      onChange={(e) => updateRule(idx, "value", e.target.value)}
                      placeholder="القيمة"
                      className="w-full sm:w-[110px]"
                    />

                    {rules.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRule(idx)}
                        className="text-red-500 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowDialog(false);
                resetForm();
              }}
            >
              إلغاء
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSave}
              disabled={saving || !name.trim() || rules.every((r) => !r.value)}
            >
              {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {editingId ? "حفظ التعديلات" : "إنشاء الشريحة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          PREVIEW DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!previewSegment}
        onOpenChange={() => setPreviewSegment(null)}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              معاينة: {previewSegment?.name || ""}
            </DialogTitle>
            <DialogDescription>
              {previewSegment?.description || ""}
            </DialogDescription>
          </DialogHeader>

          {/* Rules summary */}
          <div className="flex flex-wrap gap-1 mb-2">
            {(previewSegment?.rules || []).map((r, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {getFieldLabel(r.field)} {getOperatorLabel(r.operator)}{" "}
                {r.value}
              </Badge>
            ))}
          </div>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">
                  <Users className="h-4 w-4 inline ml-1" />
                  {fmt(previewCount)} عميل مطابق
                </span>
                {previewCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="w-full sm:w-auto"
                  >
                    <a href="/merchant/campaigns">
                      <Megaphone className="h-3 w-3 ml-1" />
                      استهداف في حملة
                    </a>
                  </Button>
                )}
              </div>

              {previewCustomers.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {previewCustomers.map((c, i) => (
                      <div key={i} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">{c.name || "-"}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {c.phone || ""}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">الطلبات</p>
                            <p className="font-medium">{fmt(c.order_count)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">الإنفاق</p>
                            <p className="font-medium">
                              {fmt(c.total_spent)} ج.م
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground">آخر طلب</p>
                            <p className="font-medium">
                              {c.last_order
                                ? new Date(c.last_order).toLocaleDateString(
                                    "ar-EG",
                                  )
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-center">الطلبات</TableHead>
                          <TableHead className="text-center">الإنفاق</TableHead>
                          <TableHead className="text-center">آخر طلب</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewCustomers.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <p className="font-medium">{c.name || "-"}</p>
                              <p
                                className="text-xs text-muted-foreground"
                                dir="ltr"
                              >
                                {c.phone || ""}
                              </p>
                            </TableCell>
                            <TableCell className="text-center">
                              {fmt(c.order_count)}
                            </TableCell>
                            <TableCell className="text-center">
                              {fmt(c.total_spent)} ج.م
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {c.last_order
                                ? new Date(c.last_order).toLocaleDateString(
                                    "ar-EG",
                                  )
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  لا يوجد عملاء مطابقون لهذه الشريحة حالياً
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          DELETE CONFIRMATION
         ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
          dir="rtl"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الشريحة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذه الشريحة نهائياً. لن تتمكن من استعادتها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
            >
              {deleting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════
          BROADCAST TO SEGMENT DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!broadcastSegment}
        onOpenChange={(open) => {
          if (!open) {
            setBroadcastSegment(null);
            setBroadcastResult(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-green-600" />
              إرسال رسالة للشريحة
            </DialogTitle>
            <DialogDescription>
              إرسال رسالة واتساب لجميع العملاء في شريحة &quot;
              {broadcastSegment?.name}&quot; (
              {fmt(broadcastSegment?.customer_count)} عميل)
            </DialogDescription>
          </DialogHeader>

          {broadcastResult ? (
            <div className="space-y-3 py-4">
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-300">
                  تم الإرسال بنجاح ✓
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  تم إرسال {broadcastResult.sentCount} من{" "}
                  {broadcastResult.recipientCount} رسالة
                </p>
                {broadcastResult.failCount > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    فشل إرسال {broadcastResult.failCount} رسالة
                  </p>
                )}
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  onClick={() => {
                    setBroadcastSegment(null);
                    setBroadcastResult(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>نوع الرسالة</Label>
                <Select
                  value={broadcastType}
                  onValueChange={(v: any) => setBroadcastType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="promotional">ترويجية</SelectItem>
                    <SelectItem value="reminder">تذكير</SelectItem>
                    <SelectItem value="update">تحديث</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>عنوان الرسالة *</Label>
                <Input
                  placeholder="مثال: عرض خاص لعملائنا المميزين"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>محتوى الرسالة *</Label>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="اكتب رسالتك هنا..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setBroadcastSegment(null)}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleBroadcast}
                  disabled={
                    broadcasting ||
                    !broadcastTitle.trim() ||
                    !broadcastMessage.trim()
                  }
                  className="bg-green-600 hover:bg-green-700"
                >
                  {broadcasting && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  )}
                  <Megaphone className="h-4 w-4 ml-2" />
                  إرسال ({fmt(broadcastSegment?.customer_count)} عميل)
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
