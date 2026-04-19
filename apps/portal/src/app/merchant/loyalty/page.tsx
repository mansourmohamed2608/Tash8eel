"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRoleAccess } from "@/hooks/use-role-access";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Gift,
  Users,
  TrendingUp,
  Crown,
  Percent,
  Plus,
  RefreshCw,
  AlertCircle,
  Award,
  Ticket,
  Target,
  RotateCcw,
} from "lucide-react";
import { portalApi } from "@/lib/client";

interface LoyaltyTier {
  id: string;
  name: string;
  nameAr: string;
  minPoints: number;
  pointsMultiplier: number;
  benefits: string[];
  isActive: boolean;
}

interface Promotion {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  type: string;
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  maxUsageTotal?: number;
  usageCount: number;
  isActive: boolean;
  startsAt: string;
  endsAt?: string;
}

interface LoyaltyStats {
  totalMembers: number;
  activeMembers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  averagePointsPerCustomer: number;
  tierDistribution: Array<{ tier: string; count: number }>;
}

interface LoyaltyMember {
  customerId: string;
  customerPhone: string;
  customerName: string | null;
  currentPoints: number;
  lifetimePoints: number;
  tierName: string | null;
  lastActivityAt: string;
  createdAt: string;
}

const LOYALTY_TIER_AR: Record<string, string> = {
  Bronze: "برونزي",
  Silver: "فضي",
  Gold: "ذهبي",
  Platinum: "بلاتيني",
};

const localizeTierName = (tierName?: string | null): string => {
  if (!tierName) return "-";
  return LOYALTY_TIER_AR[tierName] || tierName;
};

export default function LoyaltyPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canCreate, canEdit, canDelete } = useRoleAccess("loyalty");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Data
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  // Dialogs
  const [showTierDialog, setShowTierDialog] = useState(false);
  const [showPromoDialog, setShowPromoDialog] = useState(false);

  // Forms
  const [newTier, setNewTier] = useState({
    name: "",
    nameAr: "",
    minPoints: 0,
    pointsMultiplier: 1,
    benefits: "",
  });

  const [newPromo, setNewPromo] = useState({
    code: "",
    name: "",
    nameAr: "",
    type: "PERCENTAGE",
    discountValue: 10,
    maxDiscount: "",
    minOrderAmount: "",
    maxUsageTotal: "",
    endsAt: "",
  });

  const [newMember, setNewMember] = useState({
    phone: "",
    name: "",
  });

  const merchantId = session?.user?.merchantId || "demo-merchant";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tiersRes, promosRes, statsRes] = await Promise.all([
        portalApi.getLoyaltyTiers(merchantId),
        portalApi.getPromotions(merchantId),
        portalApi.getLoyaltyAnalytics(merchantId),
      ]);

      setTiers(tiersRes.tiers || []);
      const mappedPromos = (promosRes.promotions || []).map((promo: any) => ({
        id: promo.id,
        code: promo.code || "",
        name: promo.name || "",
        nameAr: promo.nameAr || promo.name_ar || promo.name || "",
        type: promo.type,
        discountValue:
          promo.discountValue ?? promo.value ?? promo.discount_value ?? 0,
        maxDiscount: promo.maxDiscount ?? promo.max_discount_amount,
        minOrderAmount: promo.minOrderAmount ?? promo.min_order_amount,
        maxUsageTotal: promo.maxUsageTotal ?? promo.usage_limit,
        usageCount: promo.usageCount ?? promo.current_usage ?? 0,
        isActive: promo.isActive ?? promo.is_active ?? false,
        startsAt: promo.startsAt ?? promo.start_date,
        endsAt: promo.endsAt ?? promo.end_date,
      }));
      setPromotions(mappedPromos);
      setStats(statsRes);
    } catch (err: any) {
      setError(err.message || "Failed to load loyalty data");
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "overview" ||
      tab === "tiers" ||
      tab === "promotions" ||
      tab === "members"
    ) {
      setActiveTab(tab);
      return;
    }
    setActiveTab("overview");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // Load members when members tab is selected
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const result = await portalApi.getLoyaltyMembers(merchantId);
      setMembers(result.members || []);
    } catch (err: any) {
      console.error("Failed to load loyalty members:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    if (activeTab === "members") {
      fetchMembers();
    }
  }, [activeTab, fetchMembers]);

  const handleCreateTier = async () => {
    try {
      await portalApi.createLoyaltyTier(merchantId, {
        ...newTier,
        benefits: newTier.benefits.split("\n").filter((b) => b.trim()),
      });
      setShowTierDialog(false);
      setNewTier({
        name: "",
        nameAr: "",
        minPoints: 0,
        pointsMultiplier: 1,
        benefits: "",
      });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreatePromo = async () => {
    try {
      const discountValue = Number.isFinite(newPromo.discountValue)
        ? newPromo.discountValue
        : 0;
      if (discountValue <= 0) {
        setError("قيمة الخصم مطلوبة");
        return;
      }
      if (newPromo.type === "PERCENTAGE" && discountValue > 100) {
        setError("قيمة الخصم يجب أن تكون أقل من أو تساوي 100%");
        return;
      }
      const nowIso = new Date().toISOString();
      const endsAtIso = newPromo.endsAt
        ? new Date(newPromo.endsAt).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await portalApi.createPromotion(merchantId, {
        code: newPromo.code || undefined,
        name: newPromo.name,
        nameAr: newPromo.nameAr,
        type: newPromo.type,
        value: discountValue,
        autoApply: !newPromo.code,
        startDate: nowIso,
        endDate: endsAtIso,
        maxDiscountAmount: newPromo.maxDiscount
          ? parseFloat(newPromo.maxDiscount)
          : undefined,
        minOrderAmount: newPromo.minOrderAmount
          ? parseFloat(newPromo.minOrderAmount)
          : undefined,
        usageLimit: newPromo.maxUsageTotal
          ? parseInt(newPromo.maxUsageTotal)
          : undefined,
      });
      setShowPromoDialog(false);
      setNewPromo({
        code: "",
        name: "",
        nameAr: "",
        type: "PERCENTAGE",
        discountValue: 10,
        maxDiscount: "",
        minOrderAmount: "",
        maxUsageTotal: "",
        endsAt: "",
      });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEnrollMember = async () => {
    if (!newMember.phone.trim()) {
      setError("رقم الهاتف مطلوب");
      return;
    }
    setEnrolling(true);
    setError(null);
    try {
      await portalApi.enrollLoyaltyMember(merchantId, {
        phone: newMember.phone.trim(),
        name: newMember.name?.trim() || undefined,
      });
      setShowEnrollDialog(false);
      setNewMember({ phone: "", name: "" });
      fetchMembers();
      fetchData();
    } catch (err: any) {
      setError(err.message || "فشل في إضافة العضو");
    } finally {
      setEnrolling(false);
    }
  };

  const handleTogglePromo = async (promoId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await portalApi.deactivatePromotion(merchantId, promoId);
      } else {
        await portalApi.activatePromotion(merchantId, promoId);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <PageHeader
        title="برنامج الولاء"
        titleEn="Loyalty Program"
        description="إدارة برنامج ولاء العملاء والعروض الترويجية"
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Users className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span className="text-muted-foreground">إجمالي الأعضاء</span>
          <span className="font-mono text-[var(--accent-gold)]">
            {stats?.totalMembers ?? 0}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Star className="h-3.5 w-3.5 text-[var(--accent-success)]" />
          <span className="text-muted-foreground">نشطون</span>
          <span className="font-mono text-[var(--accent-success)]">
            {stats?.activeMembers ?? 0}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Gift className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
          <span className="text-muted-foreground">النقاط المصدرة</span>
          <span className="font-mono text-[var(--accent-blue)]">
            {stats?.totalPointsIssued ?? 0}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <RotateCcw className="h-3.5 w-3.5 text-[var(--accent-warning)]" />
          <span className="text-muted-foreground">النقاط المستبدلة</span>
          <span className="font-mono text-[var(--accent-warning)]">
            {stats?.totalPointsRedeemed ?? 0}
          </span>
        </div>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <TabsTrigger
            value="overview"
            className="flex w-full items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="tiers" className="flex w-full items-center gap-2">
            <Crown className="w-4 h-4" />
            المستويات
          </TabsTrigger>
          <TabsTrigger
            value="promotions"
            className="flex w-full items-center gap-2"
          >
            <Ticket className="w-4 h-4" />
            العروض
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="flex w-full items-center gap-2"
          >
            <Users className="w-4 h-4" />
            الأعضاء
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي الأعضاء
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.totalMembers || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.activeMembers || 0} نشط
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  النقاط الممنوحة
                </CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(stats?.totalPointsIssued || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(stats?.totalPointsRedeemed || 0).toLocaleString()} مستبدلة
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  متوسط النقاط
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(stats?.averagePointsPerCustomer || 0)}
                </div>
                <p className="text-xs text-muted-foreground">لكل عميل</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  العروض النشطة
                </CardTitle>
                <Gift className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {promotions.filter((p) => p.isActive).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  من {promotions.length} إجمالي
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tier Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>توزيع المستويات</CardTitle>
              <CardDescription>عدد العملاء في كل مستوى</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.tierDistribution?.map((tier) => (
                  <div
                    key={tier.tier}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="w-full font-medium sm:w-24">
                      {localizeTierName(tier.tier)}
                    </div>
                    <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${stats.totalMembers > 0 ? (tier.count / stats.totalMembers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="w-full text-right text-muted-foreground sm:w-16">
                      {tier.count}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tiers Tab */}
        <TabsContent value="tiers" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">مستويات الولاء</h2>
            <Dialog open={showTierDialog} onOpenChange={setShowTierDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4" />
                  إضافة مستوى
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>إضافة مستوى جديد</DialogTitle>
                  <DialogDescription>
                    أضف مستوى جديد لبرنامج الولاء
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الاسم (English)</Label>
                      <Input
                        value={newTier.name}
                        onChange={(e) =>
                          setNewTier({ ...newTier, name: e.target.value })
                        }
                        placeholder="Gold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الاسم (عربي)</Label>
                      <Input
                        value={newTier.nameAr}
                        onChange={(e) =>
                          setNewTier({ ...newTier, nameAr: e.target.value })
                        }
                        placeholder="ذهبي"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الحد الأدنى من النقاط</Label>
                      <Input
                        type="number"
                        value={newTier.minPoints}
                        onChange={(e) =>
                          setNewTier({
                            ...newTier,
                            minPoints: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>مضاعف النقاط</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={newTier.pointsMultiplier}
                        onChange={(e) =>
                          setNewTier({
                            ...newTier,
                            pointsMultiplier: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>المزايا (سطر لكل ميزة)</Label>
                    <textarea
                      className="w-full min-h-[100px] rounded-md border p-2"
                      value={newTier.benefits}
                      onChange={(e) =>
                        setNewTier({ ...newTier, benefits: e.target.value })
                      }
                      placeholder="خصم 10%&#10;شحن مجاني&#10;عروض حصرية"
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setShowTierDialog(false)}
                    className="w-full sm:w-auto"
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleCreateTier}
                    disabled={!canCreate}
                    className="w-full sm:w-auto"
                  >
                    إضافة
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => (
              <Card key={tier.id} className={tier.isActive ? "" : "opacity-60"}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-primary" />
                      {tier.nameAr}
                    </CardTitle>
                    <Badge variant={tier.isActive ? "default" : "secondary"}>
                      {tier.isActive ? "نشط" : "غير نشط"}
                    </Badge>
                  </div>
                  <CardDescription>{tier.name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">
                        الحد الأدنى:
                      </span>
                      <p className="font-medium">
                        {tier.minPoints.toLocaleString()} نقطة
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">المضاعف:</span>
                      <p className="font-medium">{tier.pointsMultiplier}x</p>
                    </div>
                  </div>
                  {tier.benefits && tier.benefits.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground">
                        المزايا:
                      </span>
                      <ul className="mt-1 space-y-1">
                        {tier.benefits.map((benefit, i) => (
                          <li
                            key={i}
                            className="text-sm flex items-center gap-2"
                          >
                            <Award className="w-3 h-3 text-primary" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Promotions Tab */}
        <TabsContent value="promotions" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">العروض الترويجية</h2>
            <Dialog open={showPromoDialog} onOpenChange={setShowPromoDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4" />
                  إضافة عرض
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>إضافة عرض ترويجي</DialogTitle>
                  <DialogDescription>أنشئ كود خصم جديد</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>كود الخصم</Label>
                      <Input
                        value={newPromo.code}
                        onChange={(e) =>
                          setNewPromo({
                            ...newPromo,
                            code: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="SUMMER20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>نوع الخصم</Label>
                      <Select
                        value={newPromo.type}
                        onValueChange={(v) =>
                          setNewPromo({ ...newPromo, type: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">نسبة مئوية</SelectItem>
                          <SelectItem value="FIXED_AMOUNT">
                            مبلغ ثابت
                          </SelectItem>
                          <SelectItem value="FREE_SHIPPING">
                            شحن مجاني
                          </SelectItem>
                          <SelectItem value="BUY_X_GET_Y">
                            اشتر X واحصل على Y
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الاسم (English)</Label>
                      <Input
                        value={newPromo.name}
                        onChange={(e) =>
                          setNewPromo({ ...newPromo, name: e.target.value })
                        }
                        placeholder="Summer Sale"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الاسم (عربي)</Label>
                      <Input
                        value={newPromo.nameAr}
                        onChange={(e) =>
                          setNewPromo({ ...newPromo, nameAr: e.target.value })
                        }
                        placeholder="تخفيضات الصيف"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        قيمة الخصم{" "}
                        {newPromo.type === "PERCENTAGE" ? "(%)" : "(EGP)"}
                      </Label>
                      <Input
                        type="number"
                        value={newPromo.discountValue}
                        onChange={(e) =>
                          setNewPromo({
                            ...newPromo,
                            discountValue: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الحد الأقصى للخصم (EGP)</Label>
                      <Input
                        type="number"
                        value={newPromo.maxDiscount}
                        onChange={(e) =>
                          setNewPromo({
                            ...newPromo,
                            maxDiscount: e.target.value,
                          })
                        }
                        placeholder="اختياري"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الحد الأدنى للطلب (EGP)</Label>
                      <Input
                        type="number"
                        value={newPromo.minOrderAmount}
                        onChange={(e) =>
                          setNewPromo({
                            ...newPromo,
                            minOrderAmount: e.target.value,
                          })
                        }
                        placeholder="اختياري"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>عدد الاستخدامات الأقصى</Label>
                      <Input
                        type="number"
                        value={newPromo.maxUsageTotal}
                        onChange={(e) =>
                          setNewPromo({
                            ...newPromo,
                            maxUsageTotal: e.target.value,
                          })
                        }
                        placeholder="اختياري"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>تاريخ الانتهاء</Label>
                    <Input
                      type="datetime-local"
                      value={newPromo.endsAt}
                      onChange={(e) =>
                        setNewPromo({ ...newPromo, endsAt: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setShowPromoDialog(false)}
                    className="w-full sm:w-auto"
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleCreatePromo}
                    disabled={!canCreate}
                    className="w-full sm:w-auto"
                  >
                    إضافة
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-4 sm:p-6">
              {promotions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  لا توجد عروض ترويجية
                </div>
              ) : (
                <>
                  <div className="space-y-4 md:hidden">
                    {promotions.map((promo) => (
                      <div key={promo.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-semibold">{promo.nameAr}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {promo.code}
                            </div>
                          </div>
                          <Badge
                            variant={promo.isActive ? "default" : "secondary"}
                          >
                            {promo.isActive ? "نشط" : "منتهي"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">
                              النوع:
                            </span>{" "}
                            {promo.type === "PERCENTAGE"
                              ? "نسبة"
                              : promo.type === "FIXED_AMOUNT"
                                ? "ثابت"
                                : promo.type === "FREE_SHIPPING"
                                  ? "شحن مجاني"
                                  : "عرض"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              الخصم:
                            </span>{" "}
                            {promo.type === "PERCENTAGE"
                              ? `${promo.discountValue}%`
                              : promo.type === "FIXED_AMOUNT"
                                ? `${promo.discountValue} EGP`
                                : "-"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              الاستخدام:
                            </span>{" "}
                            {promo.usageCount}
                            {promo.maxUsageTotal && ` / ${promo.maxUsageTotal}`}
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">
                            تبديل الحالة
                          </span>
                          <Switch
                            checked={promo.isActive}
                            onCheckedChange={() =>
                              handleTogglePromo(promo.id, promo.isActive)
                            }
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الكود</TableHead>
                          <TableHead>الاسم</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>الخصم</TableHead>
                          <TableHead>الاستخدام</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead>الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {promotions.map((promo) => (
                          <TableRow key={promo.id}>
                            <TableCell className="font-mono font-bold">
                              {promo.code}
                            </TableCell>
                            <TableCell>{promo.nameAr}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {promo.type === "PERCENTAGE" && (
                                  <Percent className="w-3 h-3 mr-1" />
                                )}
                                {promo.type === "PERCENTAGE"
                                  ? "نسبة"
                                  : promo.type === "FIXED_AMOUNT"
                                    ? "ثابت"
                                    : promo.type === "FREE_SHIPPING"
                                      ? "شحن مجاني"
                                      : "عرض"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {promo.type === "PERCENTAGE"
                                ? `${promo.discountValue}%`
                                : promo.type === "FIXED_AMOUNT"
                                  ? `${promo.discountValue} EGP`
                                  : "-"}
                            </TableCell>
                            <TableCell>
                              {promo.usageCount}
                              {promo.maxUsageTotal &&
                                ` / ${promo.maxUsageTotal}`}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  promo.isActive ? "default" : "secondary"
                                }
                              >
                                {promo.isActive ? "نشط" : "منتهي"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={promo.isActive}
                                onCheckedChange={() =>
                                  handleTogglePromo(promo.id, promo.isActive)
                                }
                                disabled={!canEdit}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    أعضاء برنامج الولاء
                  </CardTitle>
                  <CardDescription>
                    العملاء المسجلين في برنامج الولاء ونقاطهم
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowEnrollDialog(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة عضو
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    لا يوجد أعضاء في برنامج الولاء بعد
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    سيظهر هنا العملاء الذين لديهم نقاط ولاء
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 md:hidden">
                    {members.map((member) => (
                      <div
                        key={member.customerId}
                        className="rounded-lg border p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium">
                              {member.customerName || "عميل"}
                            </div>
                            <div
                              dir="ltr"
                              className="text-sm text-muted-foreground"
                            >
                              {member.customerPhone}
                            </div>
                          </div>
                          <Badge
                            variant="default"
                            className="bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]"
                          >
                            <Star className="h-3 w-3 ml-1" />
                            {member.currentPoints.toLocaleString("ar-SA")}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">
                              إجمالي النقاط:
                            </span>{" "}
                            {member.lifetimePoints.toLocaleString("ar-SA")}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              المستوى:
                            </span>{" "}
                            {member.tierName ? (
                              <Badge variant="outline">
                                <Crown className="h-3 w-3 ml-1" />
                                {localizeTierName(member.tierName)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              آخر نشاط:
                            </span>{" "}
                            {member.lastActivityAt
                              ? new Date(
                                  member.lastActivityAt,
                                ).toLocaleDateString("ar-SA")
                              : "-"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>العميل</TableHead>
                          <TableHead>رقم الهاتف</TableHead>
                          <TableHead>النقاط الحالية</TableHead>
                          <TableHead>إجمالي النقاط</TableHead>
                          <TableHead>المستوى</TableHead>
                          <TableHead>آخر نشاط</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.customerId}>
                            <TableCell className="font-medium">
                              {member.customerName || "عميل"}
                            </TableCell>
                            <TableCell dir="ltr" className="text-right">
                              {member.customerPhone}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="default"
                                className="bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]"
                              >
                                <Star className="h-3 w-3 ml-1" />
                                {member.currentPoints.toLocaleString("ar-SA")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {member.lifetimePoints.toLocaleString("ar-SA")}
                            </TableCell>
                            <TableCell>
                              {member.tierName ? (
                                <Badge variant="outline">
                                  <Crown className="h-3 w-3 ml-1" />
                                  {localizeTierName(member.tierName)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member.lastActivityAt
                                ? new Date(
                                    member.lastActivityAt,
                                  ).toLocaleDateString("ar-SA")
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
            <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>إضافة عضو لبرنامج الولاء</DialogTitle>
                <DialogDescription>
                  أدخل بيانات العميل لإضافته لبرنامج الولاء
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={newMember.phone}
                    onChange={(e) =>
                      setNewMember({ ...newMember, phone: e.target.value })
                    }
                    placeholder="+20xxxxxxxxxx"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الاسم (اختياري)</Label>
                  <Input
                    value={newMember.name}
                    onChange={(e) =>
                      setNewMember({ ...newMember, name: e.target.value })
                    }
                    placeholder="اسم العميل"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setShowEnrollDialog(false)}
                  className="w-full sm:w-auto"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleEnrollMember}
                  disabled={!canCreate || enrolling}
                  className="w-full sm:w-auto"
                >
                  {enrolling ? "جاري الإضافة..." : "إضافة"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
