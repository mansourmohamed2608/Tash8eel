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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Phone,
  User,
  Calendar,
  DollarSign,
  MessageSquare,
  Printer,
  Share2,
  MoreVertical,
  ChevronRight,
  AlertTriangle,
  Timer,
  Star,
  FileText,
  Copy,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// Order Timeline Component
interface OrderTimelineEvent {
  id: string;
  status: string;
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
}

interface OrderTimelineProps {
  events: OrderTimelineEvent[];
  currentStatus: string;
}

export function OrderTimeline({ events, currentStatus }: OrderTimelineProps) {
  const statusOrder = [
    "DRAFT",
    "CONFIRMED",
    "BOOKED",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  const currentIndex = statusOrder.indexOf(currentStatus);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <ShoppingCart className="h-4 w-4" />;
      case "CONFIRMED":
        return <CheckCircle className="h-4 w-4" />;
      case "BOOKED":
        return <Package className="h-4 w-4" />;
      case "SHIPPED":
        return <Truck className="h-4 w-4" />;
      case "OUT_FOR_DELIVERY":
        return <Truck className="h-4 w-4" />;
      case "DELIVERED":
        return <CheckCircle className="h-4 w-4" />;
      case "CANCELLED":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {events.map((event, index) => {
        const isCompleted = statusOrder.indexOf(event.status) <= currentIndex;
        const isCurrent = event.status === currentStatus;
        const isCancelled = currentStatus === "CANCELLED";

        return (
          <div key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  isCancelled && event.status === "CANCELLED"
                    ? "bg-[var(--accent-danger)] border-[var(--accent-danger)] text-white"
                    : isCompleted
                      ? "bg-primary border-primary text-white"
                      : "bg-background border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {getStatusIcon(event.status)}
              </div>
              {index < events.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-full min-h-8 transition-colors",
                    isCompleted && !isCurrent
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                  )}
                />
              )}
            </div>
            <div className="flex-1 pb-6">
              <div className="flex items-center justify-between">
                <h4
                  className={cn(
                    "font-medium",
                    isCompleted ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {event.title}
                </h4>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleString("ar-SA")}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {event.description}
                </p>
              )}
              {event.user && (
                <p className="text-xs text-muted-foreground mt-1">
                  بواسطة: {event.user}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Order Summary Card
interface OrderSummaryProps {
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    address: string;
    items: Array<{ name: string; quantity: number; unitPrice: number }>;
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
  };
  onPrint?: () => void;
  onShare?: () => void;
  onCancel?: () => void;
}

export function OrderSummaryCard({
  order,
  onPrint,
  onShare,
  onCancel,
}: OrderSummaryProps) {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: "bg-gray-100 text-gray-700",
      CONFIRMED: "bg-blue-100 text-blue-700",
      BOOKED: "bg-purple-100 text-purple-700",
      SHIPPED: "bg-orange-100 text-orange-700",
      OUT_FOR_DELIVERY: "bg-orange-100 text-orange-700",
      DELIVERED: "bg-green-100 text-green-700",
      CANCELLED: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "مسودة",
      CONFIRMED: "مؤكد",
      BOOKED: "محجوز للشحن",
      SHIPPED: "قيد التوصيل",
      OUT_FOR_DELIVERY: "قيد التوصيل",
      DELIVERED: "تم التسليم",
      CANCELLED: "ملغي",
    };
    return labels[status] || status;
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-700",
      PAID: "bg-green-100 text-green-700",
      REFUNDED: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              طلب #{order.orderNumber}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => navigator.clipboard.writeText(order.orderNumber)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </CardTitle>
            <CardDescription>
              {new Date(order.createdAt).toLocaleString("ar-SA")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn(getStatusColor(order.status))}>
              {getStatusLabel(order.status)}
            </Badge>
            <Badge className={cn(getPaymentStatusColor(order.paymentStatus))}>
              {order.paymentStatus === "PAID"
                ? "مدفوع"
                : order.paymentStatus === "PENDING"
                  ? "معلق"
                  : "مسترد"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Customer Info */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{order.customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm" dir="ltr">
              {order.customerPhone}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="text-sm">{order.address}</span>
          </div>
        </div>

        {/* Order Items */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">
            المنتجات ({order.items.length})
          </h4>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <span className="font-medium">
                  {formatCurrency(item.quantity * item.unitPrice)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>المجموع الفرعي</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>الشحن</span>
            <span>{formatCurrency(order.shipping)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>الخصم</span>
              <span>-{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>الإجمالي</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
          )}
          {onShare && (
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 className="h-4 w-4 ml-2" />
              مشاركة
            </Button>
          )}
          {onCancel &&
            order.status !== "CANCELLED" &&
            order.status !== "DELIVERED" && (
              <Button variant="destructive" size="sm" onClick={onCancel}>
                <XCircle className="h-4 w-4 ml-2" />
                إلغاء
              </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

// Order Kanban Board Item
interface KanbanOrderItemProps {
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
    itemCount: number;
    createdAt: string;
    priority?: "urgent" | "high" | "normal";
  };
  onClick?: () => void;
}

export function KanbanOrderItem({ order, onClick }: KanbanOrderItemProps) {
  const priorityConfig = {
    urgent: {
      color: "border-r-red-500",
      badge: "bg-red-100 text-red-700",
      label: "عاجل",
    },
    high: {
      color: "border-r-orange-500",
      badge: "bg-orange-100 text-orange-700",
      label: "مهم",
    },
    normal: { color: "border-r-transparent", badge: "", label: "" },
  };

  const priority = order.priority || "normal";
  const config = priorityConfig[priority];

  return (
    <div
      className={cn(
        "p-3 bg-card rounded-lg border shadow-sm hover:shadow-md cursor-pointer transition-all border-r-4",
        config.color,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-sm">#{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground">{order.customerName}</p>
        </div>
        {priority !== "normal" && (
          <Badge className={cn("text-xs", config.badge)}>{config.label}</Badge>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {order.itemCount} منتج
        </span>
        <span className="font-medium text-foreground">
          {formatCurrency(order.total)}
        </span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {new Date(order.createdAt).toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

// Order Status Filter Pills
interface StatusFilterProps {
  statuses: Array<{ value: string; label: string; count: number }>;
  selected: string;
  onChange: (status: string) => void;
}

export function OrderStatusFilter({
  statuses,
  selected,
  onChange,
}: StatusFilterProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "all":
        return null;
      case "DRAFT":
        return <ShoppingCart className="h-3 w-3" />;
      case "CONFIRMED":
        return <CheckCircle className="h-3 w-3" />;
      case "BOOKED":
        return <Package className="h-3 w-3" />;
      case "SHIPPED":
        return <Truck className="h-3 w-3" />;
      case "OUT_FOR_DELIVERY":
        return <Truck className="h-3 w-3" />;
      case "DELIVERED":
        return <CheckCircle className="h-3 w-3" />;
      case "CANCELLED":
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <Button
          key={status.value}
          variant={selected === status.value ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => onChange(status.value)}
        >
          {getStatusIcon(status.value)}
          <span className={status.value !== "all" ? "mr-1" : ""}>
            {status.label}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "mr-1 text-xs h-5 min-w-5 flex items-center justify-center",
              selected === status.value
                ? "bg-white/20 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {status.count}
          </Badge>
        </Button>
      ))}
    </div>
  );
}

// Order Notes Dialog
interface OrderNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    createdBy: string;
  }>;
  onAddNote: (content: string) => void;
}

export function OrderNotesDialog({
  open,
  onOpenChange,
  orderNumber,
  notes,
  onAddNote,
}: OrderNotesDialogProps) {
  const [newNote, setNewNote] = React.useState("");

  const handleSubmit = () => {
    if (newNote.trim()) {
      onAddNote(newNote);
      setNewNote("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            ملاحظات الطلب #{orderNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <ScrollArea className="h-64 mb-4">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                لا توجد ملاحظات
              </p>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm">{note.content}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{note.createdBy}</span>
                      <span>
                        {new Date(note.createdAt).toLocaleString("ar-SA")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="space-y-2">
            <Label htmlFor="newNote">إضافة ملاحظة</Label>
            <Textarea
              id="newNote"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="اكتب ملاحظتك هنا..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button onClick={handleSubmit} disabled={!newNote.trim()}>
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Quick Stats Bar for Orders
interface OrderQuickStatsProps {
  stats: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    cancelled: number;
    todayRevenue: number;
    averageOrderValue: number;
  };
}

export function OrderQuickStats({ stats }: OrderQuickStatsProps) {
  const items = [
    {
      label: "إجمالي الطلبات",
      value: stats.total,
      icon: ShoppingCart,
      color: "text-blue-500",
    },
    {
      label: "قيد الانتظار",
      value: stats.pending,
      icon: Clock,
      color: "text-[var(--accent-warning)]",
    },
    {
      label: "قيد التنفيذ",
      value: stats.processing,
      icon: Package,
      color: "text-purple-500",
    },
    {
      label: "مكتملة",
      value: stats.completed,
      icon: CheckCircle,
      color: "text-[var(--accent-success)]",
    },
    {
      label: "ملغية",
      value: stats.cancelled,
      icon: XCircle,
      color: "text-[var(--accent-danger)]",
    },
    {
      label: "إيرادات اليوم",
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      color: "text-[var(--accent-success)]",
    },
    {
      label: "متوسط قيمة الطلب المكتمل",
      value: formatCurrency(stats.averageOrderValue),
      icon: Star,
      color: "text-[var(--accent-warning)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <item.icon className={cn("h-4 w-4", item.color)} />
            <span className="text-xs text-muted-foreground truncate">
              {item.label}
            </span>
          </div>
          <p className="text-lg font-bold">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}

// Delivery Tracking Component
interface DeliveryTrackingProps {
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  currentLocation?: string;
  status: string;
}

export function DeliveryTracking({
  trackingNumber,
  carrier,
  estimatedDelivery,
  currentLocation,
  status,
}: DeliveryTrackingProps) {
  const steps = [
    { key: "picked", label: "تم الاستلام", icon: Package },
    { key: "in_transit", label: "قيد النقل", icon: Truck },
    { key: "out_for_delivery", label: "خارج للتوصيل", icon: MapPin },
    { key: "delivered", label: "تم التسليم", icon: CheckCircle },
  ];

  const currentStep = steps.findIndex((s) => s.key === status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          تتبع الشحنة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {trackingNumber && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">رقم التتبع</p>
              <p className="font-mono font-medium" dir="ltr">
                {trackingNumber}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigator.clipboard.writeText(trackingNumber)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}

        {carrier && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">شركة الشحن:</span>
            <span className="font-medium">{carrier}</span>
          </div>
        )}

        {estimatedDelivery && (
          <div className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">موعد التسليم المتوقع:</span>
            <span className="font-medium">{estimatedDelivery}</span>
          </div>
        )}

        {currentLocation && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">الموقع الحالي:</span>
            <span className="font-medium">{currentLocation}</span>
          </div>
        )}

        {/* Progress Steps */}
        <div className="pt-4">
          <div className="flex justify-between relative">
            {/* Progress Line */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted -z-10">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.max(0, (currentStep / (steps.length - 1)) * 100)}%`,
                }}
              />
            </div>

            {steps.map((step, index) => {
              const isCompleted = index <= currentStep;
              const isCurrent = index === currentStep;

              return (
                <div key={step.key} className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                      isCompleted
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <step.icon className="h-4 w-4" />
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 text-center",
                      isCurrent
                        ? "text-primary font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
