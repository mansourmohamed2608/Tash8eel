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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  Crown,
  Heart,
  UserCheck,
  UserX,
  Star,
  Phone,
  ShoppingBag,
  TrendingUp,
  Gift,
  Send,
  Calendar,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { apiFetch } from "@/lib/client";

interface Customer {
  customerId: string;
  name: string;
  phone: string;
  segment: "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";
  orderCount: number;
  totalSpent: number;
  lastOrder: string | null;
  daysSinceLastOrder: number | null;
  loyaltyTier?: string | null;
  loyaltyPoints?: number;
}

interface CustomerInsights {
  customerId: string;
  profile: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalSpent: number;
    avgOrderValue: number;
    firstOrderDate: string;
    lastOrderDate: string;
  };
  conversationStats: {
    total: number;
    successful: number;
    avgMessages: number;
    escalations: number;
  };
  favoriteProducts: Array<{ product_name: string; total_quantity: number }>;
  recentActivity: Array<{
    type: string;
    id: string;
    status: string;
    value: number;
    created_at: string;
  }>;
  insights: {
    segment: string;
    clv: number;
    churnRisk: "LOW" | "MEDIUM" | "HIGH";
    riskScore?: number; // Numeric 0-100 score
    riskFactors?: string[]; // Array of Arabic reason strings
    conversionRate: number;
  };
}

interface SegmentSummary {
  VIP: { count: number; revenue: number };
  LOYAL: { count: number; revenue: number };
  REGULAR: { count: number; revenue: number };
  NEW: { count: number; revenue: number };
  AT_RISK: { count: number; revenue: number };
}

const segmentConfig: Record<
  string,
  { label: string; color: string; icon: any; description: string }
> = {
  VIP: {
    label: "VIP",
    color: "bg-yellow-500",
    icon: Crown,
    description: "5+ طلبات، 1000+ إنفاق، نشط آخر 30 يوم",
  },
  LOYAL: {
    label: "مخلص",
    color: "bg-purple-500",
    icon: Heart,
    description: "3+ طلبات، نشط آخر 60 يوم",
  },
  REGULAR: {
    label: "منتظم",
    color: "bg-blue-500",
    icon: UserCheck,
    description: "1-2 طلب، نشط آخر 90 يوم",
  },
  NEW: {
    label: "جديد (بدون طلب)",
    color: "bg-green-500",
    icon: Star,
    description: "تمت إضافته كعميل لكن بدون طلبات حتى الآن",
  },
  AT_RISK: {
    label: "معرض للخسارة",
    color: "bg-red-500",
    icon: UserX,
    description: "غير نشط أكثر من 90 يوم",
  },
};

const LOYALTY_TIER_AR: Record<string, string> = {
  Bronze: "برونزي",
  Silver: "فضي",
  Gold: "ذهبي",
  Platinum: "بلاتيني",
};

const localizeTierName = (tierName?: string | null): string | null => {
  if (!tierName) return null;
  return LOYALTY_TIER_AR[tierName] || tierName;
};

const churnRiskColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-red-100 text-red-800",
};

const ORDER_STATUS_AR: Record<string, string> = {
  BOOKED: "مسودة",
  CONFIRMED: "مؤكد",
  SHIPPED: "تم الشحن",
  OUT_FOR_DELIVERY: "قيد التوصيل",
  DELIVERED: "تم التوصيل",
  CANCELLED: "ملغي",
};

const orderStatusBadgeClass = (status?: string): string => {
  switch (status) {
    case "DELIVERED":
      return "text-green-600 border-green-200";
    case "CONFIRMED":
      return "text-blue-600 border-blue-200";
    case "SHIPPED":
    case "OUT_FOR_DELIVERY":
      return "text-purple-600 border-purple-200";
    case "CANCELLED":
      return "text-red-600 border-red-200";
    default:
      return "text-muted-foreground";
  }
};

const orderStatusLabel = (status?: string): string => {
  if (!status) return "غير معروف";
  return ORDER_STATUS_AR[status] || status;
};

export default function CustomersPage() {
  const { apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segmentSummary, setSegmentSummary] = useState<SegmentSummary | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [customerInsights, setCustomerInsights] =
    useState<CustomerInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (searchQuery) params.set("search", searchQuery);
      const data = await apiFetch<any>(`/v1/portal/customers?${params}`, {
        apiKey,
      });

      // Map API response to Customer interface
      const mappedCustomers: Customer[] = (data.customers || []).map(
        (c: any) => ({
          customerId: c.id || c.customerId,
          name: c.name || "غير معروف",
          phone: c.phone || c.whatsappId || "",
          segment: c.segment || "REGULAR",
          orderCount: Number(c.totalOrders ?? c.orderCount ?? 0) || 0,
          totalSpent: Number(c.totalSpent ?? 0) || 0,
          lastOrder: c.lastOrderDate || c.lastOrderAt || c.lastOrder || null,
          daysSinceLastOrder: Number.isFinite(Number(c.daysSinceLastOrder))
            ? Number(c.daysSinceLastOrder)
            : c.lastOrderDate || c.lastOrderAt || c.lastOrder
              ? Math.floor(
                  (Date.now() -
                    new Date(
                      c.lastOrderDate || c.lastOrderAt || c.lastOrder,
                    ).getTime()) /
                    (24 * 60 * 60 * 1000),
                )
              : null,
          loyaltyTier: localizeTierName(c.loyaltyTier) || null,
          loyaltyPoints: Number(c.loyaltyPoints ?? 0) || 0,
        }),
      );

      setCustomers(mappedCustomers);

      // Calculate segment summary
      const summary: SegmentSummary = {
        VIP: { count: 0, revenue: 0 },
        LOYAL: { count: 0, revenue: 0 },
        REGULAR: { count: 0, revenue: 0 },
        NEW: { count: 0, revenue: 0 },
        AT_RISK: { count: 0, revenue: 0 },
      };

      for (const c of mappedCustomers) {
        if (summary[c.segment]) {
          summary[c.segment].count++;
          summary[c.segment].revenue += c.totalSpent;
        }
      }

      setSegmentSummary(summary);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل العملاء");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, apiKey]);

  const fetchCustomerInsights = useCallback(
    async (customer: Customer) => {
      setLoadingInsights(true);
      try {
        const data = await apiFetch<any>(
          `/v1/portal/customers/${customer.customerId}`,
          { apiKey },
        );
        setCustomerInsights(data as CustomerInsights);
      } catch (err) {
        console.error("Failed to fetch customer insights:", err);
        setError(
          err instanceof Error ? err.message : "فشل في تحميل تفاصيل العميل",
        );
      } finally {
        setLoadingInsights(false);
      }
    },
    [apiKey],
  );

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerInsights(selectedCustomer);
    }
  }, [selectedCustomer, fetchCustomerInsights]);

  // Filter customers
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);
    const matchesSegment =
      segmentFilter === "all" || c.segment === segmentFilter;
    return matchesSearch && matchesSegment;
  });

  if (loading) {
    return (
      <div>
        <PageHeader title="العملاء" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="العملاء" />
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">خطأ في تحميل العملاء</h3>
              <p className="text-muted-foreground mt-2">{error}</p>
              <Button
                onClick={fetchCustomers}
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
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="إدارة العملاء"
        description="تحليل وتقسيم العملاء حسب قيمتهم"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCustomers}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground">
          الشريحة تُحسب من نشاط الطلبات (عدد الطلبات + حداثة آخر طلب)، بينما
          الولاء يُحسب من نقاط برنامج الولاء والمستوى (برونزي/فضي/ذهبي).
        </CardContent>
      </Card>

      {/* Segment Summary Cards */}
      {segmentSummary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Object.entries(segmentConfig).map(([key, config]) => {
            const data = segmentSummary[key as keyof SegmentSummary];
            const Icon = config.icon;
            return (
              <Card
                key={key}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  segmentFilter === key && "ring-2 ring-primary",
                )}
                onClick={() =>
                  setSegmentFilter(segmentFilter === key ? "all" : key)
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        config.color,
                        "text-white",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{config.label}</p>
                      <p className="text-2xl font-bold">{data.count}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(data.revenue)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={segmentFilter} onValueChange={setSegmentFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="كل الشرائح" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشرائح</SelectItem>
                {Object.entries(segmentConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          {filteredCustomers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">لا يوجد عملاء</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {filteredCustomers.map((customer) => {
                  const config = segmentConfig[customer.segment];
                  const Icon = config.icon;
                  return (
                    <Card
                      key={customer.customerId}
                      className="cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <CardContent className="space-y-3 p-4 text-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-lg font-bold text-primary">
                              {customer.name.charAt(0)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{customer.name}</p>
                            <p
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(customer);
                            }}
                          >
                            عرض
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={cn(config.color, "text-white")}>
                            <Icon className="ml-1 h-3 w-3" />
                            {config.label}
                          </Badge>
                          {customer.loyaltyTier ? (
                            <Badge variant="outline">
                              <Crown className="ml-1 h-3 w-3" />
                              {customer.loyaltyTier}
                            </Badge>
                          ) : (
                            <Badge variant="outline">غير مسجل</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">الطلبات</p>
                            <p className="font-medium">{customer.orderCount}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">الإنفاق</p>
                            <p className="font-medium">
                              {formatCurrency(customer.totalSpent)}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground">آخر طلب</p>
                            <p className="font-medium">
                              {customer.lastOrder
                                ? formatRelativeTime(customer.lastOrder)
                                : "-"}
                            </p>
                            {(customer.daysSinceLastOrder ?? 0) > 60 && (
                              <Badge
                                variant="outline"
                                className="mt-1 border-red-200 text-xs text-red-500"
                              >
                                <AlertTriangle className="ml-1 h-3 w-3" />
                                {customer.daysSinceLastOrder} يوم
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">العميل</TableHead>
                      <TableHead className="text-right">الشريحة</TableHead>
                      <TableHead className="text-right">الولاء</TableHead>
                      <TableHead className="text-right">الطلبات</TableHead>
                      <TableHead className="text-right">الإنفاق</TableHead>
                      <TableHead className="text-right">آخر طلب</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => {
                      const config = segmentConfig[customer.segment];
                      const Icon = config.icon;
                      return (
                        <TableRow
                          key={customer.customerId}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                <span className="text-lg font-bold text-primary">
                                  {customer.name.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p
                                  className="flex items-center gap-1 text-sm text-muted-foreground"
                                  dir="ltr"
                                >
                                  <Phone className="h-3 w-3" />
                                  {customer.phone}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(config.color, "text-white")}>
                              <Icon className="ml-1 h-3 w-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {customer.loyaltyTier ? (
                              <div className="space-y-1">
                                <Badge variant="outline">
                                  <Crown className="ml-1 h-3 w-3" />
                                  {customer.loyaltyTier}
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  {(customer.loyaltyPoints || 0).toLocaleString(
                                    "ar-SA",
                                  )}{" "}
                                  نقطة
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                غير مسجل
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                              <span>{customer.orderCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(customer.totalSpent)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {customer.lastOrder
                                  ? formatRelativeTime(customer.lastOrder)
                                  : "-"}
                              </span>
                            </div>
                            {(customer.daysSinceLastOrder ?? 0) > 60 && (
                              <Badge
                                variant="outline"
                                className="mt-1 border-red-200 text-xs text-red-500"
                              >
                                <AlertTriangle className="ml-1 h-3 w-3" />
                                {customer.daysSinceLastOrder} يوم
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCustomer(customer)}
                            >
                              عرض التفاصيل
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Customer Details Dialog */}
      <Dialog
        open={!!selectedCustomer}
        onOpenChange={() => setSelectedCustomer(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xl font-bold text-primary">
                  {selectedCustomer?.name.charAt(0)}
                </span>
              </div>
              <div>
                <span>{selectedCustomer?.name}</span>
                <p
                  className="text-sm font-normal text-muted-foreground"
                  dir="ltr"
                >
                  {selectedCustomer?.phone}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription>تفاصيل وتحليلات العميل</DialogDescription>
          </DialogHeader>

          {loadingInsights ? (
            <div className="py-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : customerInsights ? (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
                <TabsTrigger value="overview" className="w-full">
                  نظرة عامة
                </TabsTrigger>
                <TabsTrigger value="orders" className="w-full">
                  الطلبات
                </TabsTrigger>
                <TabsTrigger value="insights" className="w-full">
                  التحليلات
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Quick Stats */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <ShoppingBag className="h-6 w-6 mx-auto text-primary mb-2" />
                      <p className="text-2xl font-bold">
                        {customerInsights.profile.totalOrders}
                      </p>
                      <p className="text-xs text-muted-foreground">الطلبات</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <DollarSign className="h-6 w-6 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold">
                        {formatCurrency(customerInsights.profile.totalSpent)}
                      </p>
                      <p className="text-xs text-muted-foreground">الإنفاق</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                      <p className="text-2xl font-bold">
                        {formatCurrency(customerInsights.profile.avgOrderValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        متوسط الطلب
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Crown className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
                      <p className="text-2xl font-bold">
                        {formatCurrency(customerInsights.insights.clv)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        القيمة المتوقعة
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Favorite Products */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      المنتجات المفضلة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {customerInsights.favoriteProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        لا توجد منتجات مفضلة بعد
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {customerInsights.favoriteProducts.map(
                          (product, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col gap-2 rounded bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="break-words">
                                {product.product_name}
                              </span>
                              <Badge variant="secondary">
                                {product.total_quantity} قطعة
                              </Badge>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    {customerInsights.recentActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        لا توجد طلبات لهذا العميل بعد
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {customerInsights.recentActivity.map(
                          (activity, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded">
                                  <ShoppingBag className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {activity.id || "-"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatRelativeTime(activity.created_at)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-start sm:text-end">
                                <p className="font-bold">
                                  {formatCurrency(activity.value)}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={orderStatusBadgeClass(
                                    activity.status,
                                  )}
                                >
                                  {orderStatusLabel(activity.status)}
                                </Badge>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="space-y-4 mt-4">
                {/* Segment & Risk */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground mb-2">
                        شريحة العميل
                      </p>
                      <Badge
                        className={cn(
                          segmentConfig[customerInsights.insights.segment]
                            ?.color,
                          "text-white text-lg px-3 py-1",
                        )}
                      >
                        {
                          segmentConfig[customerInsights.insights.segment]
                            ?.label
                        }
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-2">
                        {
                          segmentConfig[customerInsights.insights.segment]
                            ?.description
                        }
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">
                          خطر الخسارة
                        </p>
                        {customerInsights.insights.riskScore !== undefined && (
                          <span
                            className={cn(
                              "text-2xl font-bold",
                              customerInsights.insights.riskScore >= 50
                                ? "text-red-600"
                                : customerInsights.insights.riskScore >= 25
                                  ? "text-amber-600"
                                  : "text-green-600",
                            )}
                          >
                            {customerInsights.insights.riskScore}%
                          </span>
                        )}
                      </div>
                      <Badge
                        className={cn(
                          churnRiskColors[customerInsights.insights.churnRisk],
                          "text-lg px-3 py-1",
                        )}
                      >
                        {customerInsights.insights.churnRisk === "HIGH"
                          ? "عالي"
                          : customerInsights.insights.churnRisk === "MEDIUM"
                            ? "متوسط"
                            : "منخفض"}
                      </Badge>
                      {/* Risk Factors List */}
                      {customerInsights.insights.riskFactors &&
                        customerInsights.insights.riskFactors.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              أسباب الخطر:
                            </p>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                              {customerInsights.insights.riskFactors.map(
                                (factor, idx) => (
                                  <li
                                    key={idx}
                                    className="flex items-center gap-1"
                                  >
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    {factor}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                      {customerInsights.insights.churnRisk !== "LOW" &&
                        !customerInsights.insights.riskFactors?.length && (
                          <p className="text-xs text-muted-foreground mt-2">
                            يُنصح بإرسال عرض خاص لإعادة التفاعل
                          </p>
                        )}
                    </CardContent>
                  </Card>
                </div>

                {/* Conversation Stats */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      إحصائيات المحادثات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
                      <div>
                        <p className="text-2xl font-bold">
                          {customerInsights.conversationStats.total}
                        </p>
                        <p className="text-xs text-muted-foreground">محادثات</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {customerInsights.conversationStats.successful}
                        </p>
                        <p className="text-xs text-muted-foreground">ناجحة</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {customerInsights.insights.conversionRate}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          معدل التحويل
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {customerInsights.conversationStats.escalations}
                        </p>
                        <p className="text-xs text-muted-foreground">تصعيدات</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (selectedCustomer?.phone) {
                        const phone = selectedCustomer.phone.replace(
                          /[^0-9]/g,
                          "",
                        );
                        const msg = encodeURIComponent(
                          `مرحباً ${selectedCustomer.name}! لدينا عرض خاص لك 🎁`,
                        );
                        window.open(
                          `https://wa.me/${phone}?text=${msg}`,
                          "_blank",
                        );
                      }
                    }}
                  >
                    <Gift className="h-4 w-4 ml-2" />
                    إرسال عرض خاص
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (selectedCustomer?.phone) {
                        const phone = selectedCustomer.phone.replace(
                          /[^0-9]/g,
                          "",
                        );
                        window.open(`https://wa.me/${phone}`, "_blank");
                      }
                    }}
                  >
                    <Send className="h-4 w-4 ml-2" />
                    إرسال رسالة
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
