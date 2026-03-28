"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";
import { Calendar, Plus, Tag, Percent, Edit, Trash2 } from "lucide-react";

const PLAN_OPTIONS = [
  "ALL",
  "TRIAL",
  "STARTER",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
  "CUSTOM",
] as const;
type DiscountType = "PERCENT" | "AMOUNT";

interface OfferFormState {
  id?: string;
  code?: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  discountType: DiscountType;
  discountValue: number;
  currency?: string;
  appliesToPlan?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  campaign?: string;
  isActive?: boolean;
}

const emptyForm: OfferFormState = {
  name: "",
  discountType: "PERCENT",
  discountValue: 10,
  currency: "EGP",
  appliesToPlan: null,
  isActive: true,
};

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OfferFormState>(emptyForm);
  const { toast } = useToast();

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalApi.listSubscriptionOffers();
      setOffers(res.offers || []);
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "فشل في تحميل العروض",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const openCreate = () => {
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (offer: any) => {
    setForm({
      id: offer.id,
      code: offer.code || "",
      name: offer.name || "",
      nameAr: offer.name_ar || "",
      description: offer.description || "",
      descriptionAr: offer.description_ar || "",
      discountType: offer.discount_type || "PERCENT",
      discountValue: Number(offer.discount_value || 0),
      currency: offer.currency || "EGP",
      appliesToPlan: offer.applies_to_plan || null,
      startsAt: offer.starts_at
        ? new Date(offer.starts_at).toISOString().slice(0, 10)
        : "",
      endsAt: offer.ends_at
        ? new Date(offer.ends_at).toISOString().slice(0, 10)
        : "",
      campaign: offer.metadata?.campaign || "",
      isActive: offer.is_active !== false,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || form.discountValue <= 0) {
      toast({
        title: "خطأ",
        description: "اسم العرض وقيمة الخصم مطلوبة",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code || undefined,
        name: form.name,
        nameAr: form.nameAr || undefined,
        description: form.description || undefined,
        descriptionAr: form.descriptionAr || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        currency: form.currency || "EGP",
        appliesToPlan: form.appliesToPlan || null,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || null,
        isActive: form.isActive ?? true,
        metadata: form.campaign ? { campaign: form.campaign } : {},
      };

      if (form.id) {
        await portalApi.updateSubscriptionOffer(form.id, payload);
      } else {
        await portalApi.createSubscriptionOffer(payload as any);
      }
      setShowDialog(false);
      await loadOffers();
      toast({ title: "تم", description: "تم حفظ العرض" });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "فشل في حفظ العرض",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (offerId: string) => {
    try {
      await portalApi.disableSubscriptionOffer(offerId);
      await loadOffers();
      toast({ title: "تم", description: "تم إيقاف العرض" });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "فشل في إيقاف العرض",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="عروض الاشتراك"
        description="إدارة العروض والخصومات الخاصة بالاشتراكات"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة عرض
          </Button>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            جاري التحميل...
          </CardContent>
        </Card>
      ) : offers.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            لا توجد عروض حالياً.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {offers.map((offer) => {
            const isActive = offer.is_active !== false;
            const discountLabel =
              offer.discount_type === "AMOUNT"
                ? `${offer.discount_value} ${offer.currency || "EGP"}`
                : `${offer.discount_value}%`;
            return (
              <Card key={offer.id} className={!isActive ? "opacity-70" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        {offer.name_ar || offer.name}
                      </CardTitle>
                      <CardDescription>
                        {offer.description_ar || offer.description || ""}
                      </CardDescription>
                    </div>
                    <Badge variant={isActive ? "default" : "secondary"}>
                      {isActive ? "مفعل" : "متوقف"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    الخصم: {discountLabel}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    يبدأ:{" "}
                    {offer.starts_at
                      ? new Date(offer.starts_at).toLocaleDateString("ar-SA")
                      : "اليوم"}
                    {offer.ends_at && (
                      <span>
                        {" "}
                        • ينتهي:{" "}
                        {new Date(offer.ends_at).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    الخطة: {offer.applies_to_plan || "جميع الخطط"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(offer)}
                    >
                      <Edit className="h-4 w-4 ml-1" />
                      تعديل
                    </Button>
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisable(offer.id)}
                      >
                        <Trash2 className="h-4 w-4 ml-1" />
                        إيقاف
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "تعديل عرض" : "إضافة عرض جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>اسم العرض (AR)</Label>
              <Input
                value={form.nameAr || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameAr: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>اسم العرض (EN)</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>وصف مختصر (AR)</Label>
              <Input
                value={form.descriptionAr || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    descriptionAr: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>وصف مختصر (EN)</Label>
              <Input
                value={form.description || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الخصم</Label>
              <Select
                value={form.discountType}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    discountType: value as DiscountType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">نسبة مئوية</SelectItem>
                  <SelectItem value="AMOUNT">قيمة ثابتة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>قيمة الخصم</Label>
              <Input
                type="number"
                value={form.discountValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    discountValue: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>الخطة المستهدفة</Label>
              <Select
                value={form.appliesToPlan || "ALL"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    appliesToPlan: value === "ALL" ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((plan) => (
                    <SelectItem key={plan} value={plan}>
                      {plan}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>العملة (للخصم الثابت)</Label>
              <Input
                value={form.currency || "EGP"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, currency: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ البداية</Label>
              <Input
                type="date"
                value={form.startsAt || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, startsAt: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ النهاية</Label>
              <Input
                type="date"
                value={form.endsAt || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, endsAt: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>المناسبة / الحملة</Label>
              <Input
                value={form.campaign || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, campaign: e.target.value }))
                }
                placeholder="رمضان، الجمعة البيضاء..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
