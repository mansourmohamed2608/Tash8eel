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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { Brain, Activity, Shield, Eye, RefreshCw } from "lucide-react";

const parseJsonMaybe = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export default function AiAuditPage() {
  const { merchantId, apiKey, isDemo } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [agentFilter, setAgentFilter] = useState("ALL");

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    try {
      const filters: any = { limit: 100 };
      if (agentFilter !== "ALL") filters.agentType = agentFilter;
      const result = await merchantApi.getAiDecisionLog(
        merchantId,
        apiKey,
        filters,
      );
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, agentFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return (
      <div>
        <PageHeader title="سجل قرارات الذكاء" />
        <DashboardSkeleton />
      </div>
    );

  const decisions = data?.decisions || [];
  const stats = data?.weeklyStats || [];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="سجل قرارات الذكاء"
        titleEn="AI Decision Audit Trail"
        description="تتبع كل قرار يتخذه الذكاء الاصطناعي مع السبب والسياق"
        actions={
          <div className="flex items-center gap-2">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">جميع الوكلاء</SelectItem>
                <SelectItem value="OPS_AGENT">العمليات</SelectItem>
                <SelectItem value="INVENTORY_AGENT">المخزون</SelectItem>
                <SelectItem value="FINANCE_AGENT">المالية</SelectItem>
                <SelectItem value="MARKETING_AGENT">التسويق</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="ml-2 h-4 w-4" /> تحديث
            </Button>
          </div>
        }
      />

      <KPIGrid>
        <StatCard
          title="قرارات هذا الأسبوع"
          value={stats
            .reduce((s: number, st: any) => s + parseInt(st.count), 0)
            .toString()}
          icon={<Brain className="h-5 w-5 text-purple-600" />}
        />
        <StatCard
          title="أنواع القرارات"
          value={new Set(
            stats.map((s: any) => s.decision_type),
          ).size.toString()}
          icon={<Activity className="h-5 w-5 text-blue-600" />}
        />
        <StatCard
          title="وكلاء نشطون"
          value={new Set(stats.map((s: any) => s.agent_type)).size.toString()}
          icon={<Shield className="h-5 w-5 text-green-600" />}
        />
      </KPIGrid>

      <Card
        className={
          isDemo
            ? "border-amber-300 bg-amber-50/60"
            : "border-blue-200 bg-blue-50/40"
        }
      >
        <CardContent className="pt-4 text-sm leading-6">
          {isDemo ? (
            <p>
              أنت في وضع تجريبي. قد تظهر قرارات تجريبية وليست من نشاط متجرك
              الحقيقي.
            </p>
          ) : (
            <p>
              هذه الصفحة تعرض سجلات فعلية من جدول <code>ai_decision_log</code>{" "}
              في قاعدة البيانات.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Weekly stats */}
      {stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>إحصائيات الأسبوع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.map((s: any, i: number) => (
                <Badge key={i} variant="outline" className="px-3 py-1">
                  {s.agent_type?.replace("_AGENT", "")} / {s.decision_type}:{" "}
                  {s.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision log */}
      <Card>
        <CardHeader>
          <CardTitle>سجل القرارات</CardTitle>
          <CardDescription>{decisions.length} قرار</CardDescription>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              لا توجد قرارات مسجلة بعد
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {decisions.map((d: any) => (
                <div
                  key={d.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 space-y-2"
                >
                  {(() => {
                    const metadata = parseJsonMaybe(d.metadata);
                    const source = metadata?.source || metadata?.origin || null;
                    return (
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {d.agent_type?.replace("_AGENT", "")}
                            </Badge>
                            <Badge>{d.decision_type}</Badge>
                            {d.confidence && (
                              <Badge
                                variant={
                                  d.confidence > 0.8
                                    ? "default"
                                    : d.confidence > 0.5
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                ثقة: {Math.round(d.confidence * 100)}%
                              </Badge>
                            )}
                            {source && (
                              <Badge variant="secondary">
                                المصدر: {String(source)}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleString("ar-EG")}
                          </span>
                        </div>
                        {d.input_summary && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              المدخلات:
                            </span>{" "}
                            {d.input_summary}
                          </p>
                        )}
                        {d.decision && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              القرار:
                            </span>{" "}
                            {d.decision}
                          </p>
                        )}
                        {d.reasoning && (
                          <p className="text-sm text-muted-foreground mb-1">
                            <Eye className="h-3 w-3 inline ml-1" />{" "}
                            {d.reasoning}
                          </p>
                        )}
                        {d.entity_type && (
                          <div className="text-xs text-muted-foreground">
                            {d.entity_type}: {d.entity_id}
                          </div>
                        )}
                        {metadata && (
                          <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(metadata, null, 2)}
                          </pre>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
