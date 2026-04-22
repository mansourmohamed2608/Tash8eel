"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  TrendingUp,
  Package,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Copy,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface SubstituteSuggestion {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantityAvailable: number;
  rank?: number;
  similarityScore?: number;
  aiReasonAr?: string;
  aiReasonEn?: string;
}

interface SubstituteGroup {
  outOfStockItem: {
    variantId: string;
    sku: string;
    name: string;
    category: string;
  };
  alternatives: SubstituteSuggestion[];
  customerMessageAr?: string;
  merchantMessageAr?: string;
}

interface RestockRecommendation {
  variantId: string;
  sku: string;
  name: string;
  currentQuantity: number;
  recommendedQuantity: number;
  urgency: "critical" | "high" | "medium" | "low";
  reasoning: string;
  estimatedDaysUntilStockout?: number;
  ai?: {
    explanationAr: string;
    explanationEn: string;
    suggestedActions: Array<{
      actionType: string;
      descriptionAr: string;
      descriptionEn: string;
    }>;
    supplierMessageDraftAr?: string;
  };
}

interface AIStatus {
  configured: boolean;
  active: boolean;
  error?: string | null;
  budgetExhausted?: boolean;
}

interface AIInsightsPanelProps {
  merchantId: string;
  onSendSubstitutionMessage?: (itemId: string, message: string) => void;
}

export function AIInsightsPanel({
  merchantId,
  onSendSubstitutionMessage,
}: AIInsightsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [substituteGroups, setSubstituteGroups] = useState<SubstituteGroup[]>(
    [],
  );
  const [restockRecs, setRestockRecs] = useState<RestockRecommendation[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    configured: false,
    active: false,
  });
  const [selectedRec, setSelectedRec] = useState<RestockRecommendation | null>(
    null,
  );
  const [showSupplierMessage, setShowSupplierMessage] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const fetchInsights = useCallback(async () => {
    try {
      const [substituteData, restockData] = await Promise.all([
        portalApi.getSubstituteSuggestions(merchantId).catch(() => []),
        portalApi.getRestockRecommendations(merchantId).catch(() => ({
          items: [],
          aiStatus: { configured: false, active: false },
        })),
      ]);
      setSubstituteGroups(substituteData || []);
      // Handle both old array format and new { items, aiStatus } format
      if (Array.isArray(restockData)) {
        setRestockRecs(restockData);
      } else {
        setRestockRecs(restockData?.items || []);
        if (restockData?.aiStatus) {
          setAiStatus(restockData.aiStatus);
        }
      }
    } catch (error) {
      console.error("Failed to fetch AI insights:", error);
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-green-100 text-green-800 border-green-200";
    }
  };

  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case "critical":
        return "حرج";
      case "high":
        return "عالي";
      case "medium":
        return "متوسط";
      default:
        return "منخفض";
    }
  };

  const handleCopyMessage = (message: string) => {
    navigator.clipboard.writeText(message);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInsights();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Status Banner - only shown when AI is NOT working */}
      {!aiStatus.active && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg p-4 border",
            aiStatus.budgetExhausted || aiStatus.error === "AI_QUOTA_EXHAUSTED"
              ? "bg-orange-50 border-orange-200 text-orange-800"
              : "bg-slate-50 border-slate-200 text-slate-700",
          )}
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            {aiStatus.budgetExhausted ||
            aiStatus.error === "AI_QUOTA_EXHAUSTED" ? (
              <>
                <p className="text-sm font-semibold">
                  تم استنفاد رصيد الذكاء الاصطناعي اليومي
                </p>
                <p className="text-xs mt-1">
                  سيتم تجديد الرصيد تلقائياً غداً، أو يمكنك ترقية باقتك للحصول
                  على رصيد أكبر.
                </p>
              </>
            ) : aiStatus.error === "AI_TEMPORARILY_UNAVAILABLE" ? (
              <>
                <p className="text-sm font-semibold">
                  الذكاء الاصطناعي غير متاح مؤقتاً
                </p>
                <p className="text-xs mt-1">
                  يُرجى المحاولة مرة أخرى بعد قليل.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  ميزة الذكاء الاصطناعي غير مفعّلة
                </p>
                <p className="text-xs mt-1">
                  قم بتفعيل خدمة الذكاء الاصطناعي أو ترقية باقتك للحصول على
                  توصيات ذكية وتحليلات متقدمة للمخزون.
                </p>
              </>
            )}
          </div>
          <a
            href="/merchant/plan"
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              aiStatus.budgetExhausted ||
                aiStatus.error === "AI_QUOTA_EXHAUSTED"
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {aiStatus.budgetExhausted || aiStatus.error === "AI_QUOTA_EXHAUSTED"
              ? "ترقية الباقة"
              : "تفعيل الذكاء الاصطناعي"}
          </a>
        </div>
      )}

      {/* Only render AI content when AI is actually active */}
      {aiStatus.active && (
        <>
          {/* AI Restock Recommendations */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                توصيات إعادة التخزين الذكية
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn("h-4 w-4 ml-1", refreshing && "animate-spin")}
                />
                تحديث
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {restockRecs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>المخزون في حالة جيدة! لا توجد توصيات حالياً.</p>
                </div>
              ) : (
                restockRecs.map((rec) => (
                  <div
                    key={rec.variantId}
                    className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{rec.name}</h4>
                          <Badge className={getUrgencyColor(rec.urgency)}>
                            {getUrgencyLabel(rec.urgency)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          SKU: {rec.sku}
                        </p>
                      </div>
                      <div className="text-left">
                        <div className="text-2xl font-bold text-red-600">
                          {rec.currentQuantity}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          متبقي
                        </div>
                      </div>
                    </div>

                    {/* AI Explanation */}
                    {rec.ai && (
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-purple-900">
                            {rec.ai.explanationAr}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Suggested Actions */}
                    {rec.ai?.suggestedActions && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                          الإجراءات المقترحة:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {rec.ai.suggestedActions.map((action, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                if (
                                  action.actionType === "reorder_urgent" ||
                                  action.actionType === "reorder_normal"
                                ) {
                                  setSelectedRec(rec);
                                  setShowSupplierMessage(true);
                                }
                              }}
                            >
                              {action.actionType === "reorder_urgent" && (
                                <AlertTriangle className="h-3 w-3 ml-1 text-red-500" />
                              )}
                              {action.actionType === "push_promotion" && (
                                <TrendingUp className="h-3 w-3 ml-1 text-blue-500" />
                              )}
                              {action.descriptionAr}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                      <span>
                        الكمية الموصى بها:{" "}
                        <strong className="text-foreground">
                          {rec.recommendedQuantity}
                        </strong>
                      </span>
                      {rec.estimatedDaysUntilStockout && (
                        <span>
                          ينفد خلال:{" "}
                          <strong className="text-red-600">
                            {rec.estimatedDaysUntilStockout} أيام
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* AI Substitute Suggestions */}
          {substituteGroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  بدائل مقترحة للمنتجات غير المتوفرة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {substituteGroups.map((group) => (
                  <div
                    key={group.outOfStockItem.variantId}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-semibold">
                        {group.outOfStockItem.name}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        غير متوفر
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({group.outOfStockItem.category})
                      </span>
                    </div>

                    {group.merchantMessageAr && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-blue-900">
                            {group.merchantMessageAr}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        البدائل المتاحة:
                      </p>
                      {group.alternatives.map((alt, idx) => (
                        <div
                          key={alt.id}
                          className="flex items-center justify-between bg-muted/50 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {alt.rank ?? idx + 1}
                            </span>
                            <div>
                              <p className="font-medium text-sm">{alt.name}</p>
                              {alt.aiReasonAr && (
                                <p className="text-xs text-muted-foreground">
                                  {alt.aiReasonAr}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-left text-sm">
                            <div className="font-semibold">
                              {formatCurrency(alt.price)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              متوفر: {alt.quantityAvailable}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Supplier Message Dialog */}
      <Dialog open={showSupplierMessage} onOpenChange={setShowSupplierMessage}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              رسالة للمورد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <pre className="whitespace-pre-wrap text-sm font-sans" dir="rtl">
                {selectedRec?.ai?.supplierMessageDraftAr ||
                  `السلام عليكم،
محتاجين نطلب ${selectedRec?.name} - الكمية: ${selectedRec?.recommendedQuantity} قطعة
ياريت تفيدونا بموعد التسليم.
شكراً`}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 هذه الرسالة تم إنشاؤها بواسطة الذكاء الاصطناعي. يمكنك تعديلها
              قبل الإرسال.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                handleCopyMessage(selectedRec?.ai?.supplierMessageDraftAr || "")
              }
            >
              <Copy className="h-4 w-4 ml-1" />
              {copiedMessage ? "تم النسخ!" : "نسخ"}
            </Button>
            <Button
              onClick={() => {
                // In production: send via WhatsApp or email
                setShowSupplierMessage(false);
              }}
            >
              <Send className="h-4 w-4 ml-1" />
              إرسال عبر واتساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AIInsightsPanel;
