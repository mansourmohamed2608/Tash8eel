"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Crown,
  Heart,
  UserCheck,
  AlertTriangle,
  Star,
  Phone,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Gift,
  Send,
  Calendar,
  DollarSign,
  MessageSquare,
  Mail,
  Clock,
  Target,
  Award,
  ChevronRight,
  Sparkles,
  Tag,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Customer Segment Badge
interface SegmentBadgeProps {
  segment: "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export function SegmentBadge({
  segment,
  size = "md",
  showIcon = true,
}: SegmentBadgeProps) {
  const config = {
    VIP: {
      color: "bg-purple-100 text-purple-700 border-purple-200",
      icon: Crown,
      label: "عميل مميز",
    },
    LOYAL: {
      color: "bg-blue-100 text-blue-700 border-blue-200",
      icon: Heart,
      label: "عميل وفي",
    },
    REGULAR: {
      color: "bg-green-100 text-green-700 border-green-200",
      icon: UserCheck,
      label: "عميل منتظم",
    },
    NEW: {
      color: "bg-cyan-100 text-cyan-700 border-cyan-200",
      icon: Star,
      label: "عميل جديد",
    },
    AT_RISK: {
      color: "bg-red-100 text-red-700 border-red-200",
      icon: AlertTriangle,
      label: "قد يغادر",
    },
  };

  const { color, icon: Icon, label } = config[segment];
  const sizeClass = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <Badge className={cn("border", color, sizeClass[size])}>
      {showIcon && (
        <Icon className={cn("ml-1", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
      )}
      {label}
    </Badge>
  );
}

// Customer Profile Card
interface CustomerProfileProps {
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    segment: "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";
    memberSince: string;
    totalOrders: number;
    totalSpent: number;
    avgOrderValue: number;
    lastOrder?: string;
    loyaltyPoints?: number;
    loyaltyTier?: string;
  };
  onMessage?: () => void;
  onViewOrders?: () => void;
  onSendOffer?: () => void;
}

export function CustomerProfileCard({
  customer,
  onMessage,
  onViewOrders,
  onSendOffer,
}: CustomerProfileProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(value);

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Avatar alt={customer.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{customer.name}</h3>
              <SegmentBadge segment={customer.segment} size="sm" />
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1" dir="ltr">
                <Phone className="h-3 w-3" />
                {customer.phone}
              </span>
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {customer.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
            <p className="text-xl font-bold">{customer.totalOrders}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
            <p className="text-xl font-bold">
              {formatCurrency(customer.totalSpent)}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">متوسط الطلب</p>
            <p className="text-xl font-bold">
              {formatCurrency(customer.avgOrderValue)}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">نقاط الولاء</p>
            <p className="text-xl font-bold">{customer.loyaltyPoints || 0}</p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">عميل منذ:</span>
            <span>
              {new Date(customer.memberSince).toLocaleDateString("ar-SA")}
            </span>
          </div>
          {customer.lastOrder && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">آخر طلب:</span>
              <span>
                {new Date(customer.lastOrder).toLocaleDateString("ar-SA")}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onMessage && (
            <Button variant="outline" size="sm" onClick={onMessage}>
              <MessageSquare className="h-4 w-4 ml-2" />
              مراسلة
            </Button>
          )}
          {onViewOrders && (
            <Button variant="outline" size="sm" onClick={onViewOrders}>
              <ShoppingBag className="h-4 w-4 ml-2" />
              الطلبات
            </Button>
          )}
          {onSendOffer && (
            <Button variant="outline" size="sm" onClick={onSendOffer}>
              <Gift className="h-4 w-4 ml-2" />
              إرسال عرض
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Customer Segments Overview
interface SegmentData {
  segment: "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";
  count: number;
  revenue: number;
  percentage: number;
}

interface SegmentsOverviewProps {
  segments: SegmentData[];
  totalCustomers: number;
  onSegmentClick?: (segment: string) => void;
}

export function SegmentsOverview({
  segments,
  totalCustomers,
  onSegmentClick,
}: SegmentsOverviewProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
      maximumFractionDigits: 0,
    }).format(value);

  const segmentConfig = {
    VIP: { color: "bg-purple-500", label: "عملاء مميزين" },
    LOYAL: { color: "bg-blue-500", label: "عملاء أوفياء" },
    REGULAR: { color: "bg-green-500", label: "عملاء منتظمين" },
    NEW: { color: "bg-cyan-500", label: "عملاء جدد" },
    AT_RISK: { color: "bg-red-500", label: "قد يغادرون" },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          توزيع شرائح العملاء
        </CardTitle>
        <CardDescription>
          إجمالي العملاء: {totalCustomers.toLocaleString("ar-SA")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Distribution Bar */}
        <div className="flex h-4 rounded-full overflow-hidden">
          {segments.map((seg) => (
            <div
              key={seg.segment}
              className={cn(segmentConfig[seg.segment].color, "transition-all")}
              style={{ width: `${seg.percentage}%` }}
              title={`${segmentConfig[seg.segment].label}: ${seg.percentage}%`}
            />
          ))}
        </div>

        {/* Segment Details */}
        <div className="space-y-3">
          {segments.map((seg) => (
            <div
              key={seg.segment}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                onSegmentClick && "hover:border-primary",
              )}
              onClick={() => onSegmentClick?.(seg.segment)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      segmentConfig[seg.segment].color,
                    )}
                  />
                  <SegmentBadge
                    segment={seg.segment}
                    size="sm"
                    showIcon={false}
                  />
                </div>
                <span className="text-sm font-medium">{seg.percentage}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {seg.count.toLocaleString("ar-SA")} عميل
                </span>
                <span className="font-medium">
                  {formatCurrency(seg.revenue)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Customer Lifetime Value Card
interface CLVCardProps {
  averageCLV: number;
  topCLV: number;
  distribution: Array<{ range: string; count: number; percentage: number }>;
}

export function CLVCard({ averageCLV, topCLV, distribution }: CLVCardProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          قيمة العميل مدى الحياة (CLV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-primary/10 rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-1">المتوسط</p>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(averageCLV)}
            </p>
          </div>
          <div className="p-4 bg-[var(--success-muted)] rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-1">الأعلى</p>
            <p className="text-2xl font-bold text-[var(--accent-success)]">
              {formatCurrency(topCLV)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">توزيع CLV</p>
          {distribution.map((range) => (
            <div key={range.range} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{range.range}</span>
                <span className="text-muted-foreground">
                  {range.count} ({range.percentage}%)
                </span>
              </div>
              <Progress value={range.percentage} className="h-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Churn Risk Card
interface ChurnRiskCardProps {
  atRiskCount: number;
  totalCustomers: number;
  recentChurned: number;
  topReasons: Array<{ reason: string; count: number }>;
  onViewAtRisk?: () => void;
}

export function ChurnRiskCard({
  atRiskCount,
  totalCustomers,
  recentChurned,
  topReasons,
  onViewAtRisk,
}: ChurnRiskCardProps) {
  const riskPercentage = (atRiskCount / totalCustomers) * 100;

  return (
    <Card className="border-[color:color-mix(in_srgb,var(--accent-danger)_20%,transparent)]">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-[var(--accent-danger)]">
          <AlertTriangle className="h-4 w-4" />
          مخاطر فقدان العملاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-[var(--danger-muted)] rounded-lg">
          <div>
            <p className="text-sm text-[var(--accent-danger)]">
              عملاء معرضين للمغادرة
            </p>
            <p className="text-3xl font-bold text-[var(--accent-danger)]">
              {atRiskCount}
            </p>
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">من الإجمالي</p>
            <p className="text-xl font-bold">{riskPercentage.toFixed(1)}%</p>
          </div>
        </div>

        {recentChurned > 0 && (
          <div className="p-3 bg-[var(--warning-muted)] rounded-lg border border-[color:color-mix(in_srgb,var(--accent-warning)_20%,transparent)]">
            <p className="text-sm">
              <span className="font-medium text-[var(--accent-warning)]">
                {recentChurned} عميل
              </span>
              <span className="text-muted-foreground">
                {" "}
                غادروا في آخر 30 يوم
              </span>
            </p>
          </div>
        )}

        {topReasons.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">أسباب المغادرة المحتملة</p>
            {topReasons.map((reason, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
              >
                <span>{reason.reason}</span>
                <Badge variant="outline">{reason.count}</Badge>
              </div>
            ))}
          </div>
        )}

        {onViewAtRisk && (
          <Button variant="outline" className="w-full" onClick={onViewAtRisk}>
            عرض العملاء المعرضين للمغادرة
            <ChevronRight className="h-4 w-4 mr-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Send Offer Dialog
interface SendOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; phone: string };
  onSend: (data: { type: string; discount: number; message: string }) => void;
}

export function SendOfferDialog({
  open,
  onOpenChange,
  customer,
  onSend,
}: SendOfferDialogProps) {
  const [offerType, setOfferType] = React.useState("percentage");
  const [discount, setDiscount] = React.useState(10);
  const [message, setMessage] = React.useState("");

  const handleSubmit = () => {
    onSend({ type: offerType, discount, message });
    onOpenChange(false);
    // Reset
    setOfferType("percentage");
    setDiscount(10);
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            إرسال عرض خاص
          </DialogTitle>
          <DialogDescription>
            إرسال عرض خاص إلى {customer.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">نوع العرض</label>
            <Select value={offerType} onValueChange={setOfferType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">خصم نسبة مئوية</SelectItem>
                <SelectItem value="fixed">خصم مبلغ ثابت</SelectItem>
                <SelectItem value="freeShipping">شحن مجاني</SelectItem>
                <SelectItem value="points">نقاط إضافية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {offerType !== "freeShipping" && (
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {offerType === "percentage"
                  ? "نسبة الخصم (%)"
                  : offerType === "fixed"
                    ? "مبلغ الخصم (ر.س)"
                    : "عدد النقاط"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={offerType === "percentage" ? 100 : undefined}
                  value={discount}
                  onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <span className="text-muted-foreground">
                  {offerType === "percentage"
                    ? "%"
                    : offerType === "fixed"
                      ? "ر.س"
                      : "نقطة"}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <label className="text-sm font-medium">رسالة مخصصة (اختياري)</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اكتب رسالة مخصصة للعميل..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit}>
            <Send className="h-4 w-4 ml-2" />
            إرسال العرض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Customer Activity Timeline
interface ActivityItem {
  id: string;
  type: "order" | "message" | "review" | "points" | "offer";
  title: string;
  description?: string;
  timestamp: string;
  value?: number;
}

interface CustomerActivityProps {
  activities: ActivityItem[];
  maxItems?: number;
}

export function CustomerActivity({
  activities,
  maxItems = 5,
}: CustomerActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "order":
        return <ShoppingBag className="h-4 w-4 text-blue-500" />;
      case "message":
        return (
          <MessageSquare className="h-4 w-4 text-[var(--accent-success)]" />
        );
      case "review":
        return <Star className="h-4 w-4 text-[var(--accent-warning)]" />;
      case "points":
        return <Award className="h-4 w-4 text-purple-500" />;
      case "offer":
        return <Gift className="h-4 w-4 text-pink-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          النشاط الأخير
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-4">
            {displayActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                لا يوجد نشاط حتى الآن
              </p>
            ) : (
              displayActivities.map((activity, index) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="p-2 rounded-full bg-muted">
                      {getActivityIcon(activity.type)}
                    </div>
                    {index < displayActivities.length - 1 && (
                      <div className="w-px h-full bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm font-medium">{activity.title}</p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.timestamp).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  {activity.value !== undefined && (
                    <Badge variant="outline" className="h-fit">
                      {new Intl.NumberFormat("ar-SA", {
                        style: "currency",
                        currency: "SAR",
                      }).format(activity.value)}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
