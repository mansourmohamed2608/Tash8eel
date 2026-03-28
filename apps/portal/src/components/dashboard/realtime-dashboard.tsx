"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart,
  MessageSquare,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { portalApi } from "@/lib/client";
import { useWebSocket, RealTimeEvent } from "@/hooks/use-websocket";

interface RealTimeStats {
  activeConversations: number;
  pendingOrders: number;
  todayOrders: number;
  todayRevenue: number;
  onlineStaff: number;
}

interface LiveMetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  pulse?: boolean;
  variant?: "default" | "success" | "warning" | "danger";
}

function LiveMetricCard({
  title,
  value,
  icon,
  trend,
  pulse,
  variant = "default",
}: LiveMetricCardProps) {
  const variantStyles = {
    default: "bg-card",
    success: "bg-green-50 border-green-200",
    warning: "bg-amber-50 border-amber-200",
    danger: "bg-red-50 border-red-200",
  };

  return (
    <Card className={cn("transition-all", variantStyles[variant])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={cn("text-2xl font-bold", pulse && "animate-pulse")}>
                {value}
              </p>
              {trend !== undefined && trend !== 0 && (
                <Badge
                  variant={trend > 0 ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    trend > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700",
                  )}
                >
                  {trend > 0 ? (
                    <TrendingUp className="h-3 w-3 ml-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 ml-1" />
                  )}
                  {Math.abs(trend)}%
                </Badge>
              )}
            </div>
          </div>
          <div
            className={cn(
              "p-3 rounded-full",
              variant === "default" && "bg-primary/10 text-primary",
              variant === "success" && "bg-green-100 text-green-600",
              variant === "warning" && "bg-amber-100 text-amber-600",
              variant === "danger" && "bg-red-100 text-red-600",
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RealTimeDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<RealTimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const merchantId = session?.user?.merchantId || "demo-merchant";

  // WebSocket connection for real-time updates
  const { isConnected, isConnecting, on } = useWebSocket({
    autoConnect: true,
    subscribeToEvents: [RealTimeEvent.STATS_UPDATED],
  });

  const fetchStats = useCallback(async () => {
    try {
      const data = await portalApi.getRealTimeAnalytics(merchantId);
      setStats(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch realtime stats:", err);
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Listen for real-time stats updates via WebSocket
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on<Partial<RealTimeStats>>(
      RealTimeEvent.STATS_UPDATED,
      (payload) => {
        setStats((prev) => (prev ? { ...prev, ...payload.data } : null));
        setLastUpdate(new Date());
      },
    );

    return unsubscribe;
  }, [isConnected, on]);

  // Fallback polling only if WebSocket is not connected (every 30s instead of 10s)
  useEffect(() => {
    if (isConnected) return; // Skip polling when WebSocket is active

    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [isConnected, fetchStats]);

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold">البيانات المباشرة</h3>
          {isConnected ? (
            <Badge
              variant="outline"
              className="text-xs bg-green-50 border-green-200"
            >
              <Wifi className="h-3 w-3 ml-1 text-green-500" />
              متصل
            </Badge>
          ) : isConnecting ? (
            <Badge
              variant="outline"
              className="text-xs bg-yellow-50 border-yellow-200"
            >
              <Activity className="h-3 w-3 ml-1 text-yellow-500 animate-pulse" />
              جاري الاتصال...
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs bg-gray-50 border-gray-200"
            >
              <WifiOff className="h-3 w-3 ml-1 text-gray-400" />
              غير متصل
            </Badge>
          )}
        </div>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            آخر تحديث: {lastUpdate.toLocaleTimeString("ar-EG")}
          </span>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <LiveMetricCard
          title="محادثات نشطة"
          value={stats?.activeConversations || 0}
          icon={<MessageSquare className="h-5 w-5" />}
          pulse={Boolean(
            stats?.activeConversations && stats.activeConversations > 0,
          )}
          variant={
            stats?.activeConversations && stats.activeConversations > 5
              ? "warning"
              : "default"
          }
        />
        <LiveMetricCard
          title="طلبات معلقة"
          value={stats?.pendingOrders || 0}
          icon={<Package className="h-5 w-5" />}
          variant={
            stats?.pendingOrders && stats.pendingOrders > 10
              ? "warning"
              : "default"
          }
        />
        <LiveMetricCard
          title="طلبات اليوم"
          value={stats?.todayOrders || 0}
          icon={<ShoppingCart className="h-5 w-5" />}
          variant="success"
        />
        <LiveMetricCard
          title="إيرادات اليوم"
          value={formatCurrency(stats?.todayRevenue || 0)}
          icon={<DollarSign className="h-5 w-5" />}
          variant="success"
        />
        <LiveMetricCard
          title="فريق العمل"
          value={stats?.onlineStaff || 0}
          icon={<Users className="h-5 w-5" />}
          variant={
            stats?.onlineStaff && stats.onlineStaff > 0 ? "success" : "danger"
          }
        />
      </div>
    </div>
  );
}

export function QuickActionsPanel() {
  const actions = [
    {
      label: "طلب جديد",
      icon: ShoppingCart,
      href: "/merchant/orders/new",
      color: "bg-blue-500",
    },
    {
      label: "إضافة منتج",
      icon: Package,
      href: "/merchant/inventory/add",
      color: "bg-green-500",
    },
    {
      label: "إرسال رسالة",
      icon: MessageSquare,
      href: "/merchant/conversations",
      color: "bg-purple-500",
    },
    {
      label: "عرض التقارير",
      icon: TrendingUp,
      href: "/merchant/reports",
      color: "bg-amber-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">إجراءات سريعة</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted transition-colors"
            >
              <div className={cn("p-2 rounded-lg text-white", action.color)}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{action.label}</span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface GoalProgressProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
}

export function GoalProgress({
  label,
  current,
  target,
  unit = "",
}: GoalProgressProps) {
  const percentage = Math.min((current / target) * 100, 100);
  const isComplete = current >= target;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {current.toLocaleString()} / {target.toLocaleString()} {unit}
        </span>
      </div>
      <div className="relative">
        <Progress value={percentage} className="h-2" />
        {isComplete && (
          <CheckCircle className="absolute -right-1 -top-1 h-4 w-4 text-green-500" />
        )}
      </div>
    </div>
  );
}

export function DailyGoalsCard() {
  // In production, fetch from API
  const goals = [
    { label: "طلبات اليوم", current: 45, target: 50, unit: "طلب" },
    { label: "إيرادات اليوم", current: 12500, target: 15000, unit: "جنيه" },
    { label: "محادثات مغلقة", current: 28, target: 30, unit: "محادثة" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          أهداف اليوم
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((goal) => (
          <GoalProgress key={goal.label} {...goal} />
        ))}
      </CardContent>
    </Card>
  );
}
