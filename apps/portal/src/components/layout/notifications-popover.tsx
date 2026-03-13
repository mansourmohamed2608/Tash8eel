"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Bell,
  Check,
  X,
  MessageSquare,
  ShoppingCart,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/utils";
import { portalApi } from "@/lib/authenticated-api";
import { useMerchant } from "@/hooks/use-merchant";

interface Notification {
  id: string;
  type: "conversation" | "order" | "alert";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export function NotificationsPopover() {
  const { merchantId, isDemo } = useMerchant();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    // Skip Bearer-auth endpoint in demo mode — no session token available.
    if (isDemo) {
      setLoading(false);
      return;
    }
    const loadNotifications = async (): Promise<Notification[]> => {
      const response = await portalApi.getPortalNotifications({
        unreadOnly: false,
      });
      let rows = response?.notifications || [];

      // Compatibility fallback for environments still wired to the merchant-scoped notification call.
      if ((!rows || rows.length === 0) && merchantId) {
        const fallback = await portalApi.getNotifications(merchantId, {
          unreadOnly: false,
          limit: 50,
        });
        rows = fallback?.notifications || [];
      }

      return rows.map((n: any) => {
        const rawType = String(n?.type || "").toUpperCase();
        const mappedType: Notification["type"] = rawType.includes("ORDER")
          ? "order"
          : rawType.includes("CONVERSATION")
            ? "conversation"
            : "alert";

        return {
          id: String(n?.id || ""),
          type: mappedType,
          title: String(n?.titleAr || n?.title || "إشعار"),
          message: String(n?.messageAr || n?.message || ""),
          timestamp: String(
            n?.createdAt || n?.timestamp || new Date().toISOString(),
          ),
          read: Boolean(n?.isRead ?? n?.read ?? false),
        };
      });
    };

    try {
      const mapped = await loadNotifications();
      mapped.sort((a, b) => {
        const aTime = Date.parse(a.timestamp || "");
        const bTime = Date.parse(b.timestamp || "");
        return (
          (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
        );
      });
      setNotifications(mapped);
      setLoadFailed(false);
    } catch (error) {
      const errorStatus = (error as any)?.status;
      // 403/404 are permanent errors — no point retrying.
      if (errorStatus === 403 || errorStatus === 404) {
        // Silently swallow plan-limitation errors — expected in dev/demo.
        setLoadFailed(true);
      } else {
        // Retry once for transient backend/proxy failures (503, network error, etc.).
        try {
          const mapped = await loadNotifications();
          mapped.sort((a, b) => {
            const aTime = Date.parse(a.timestamp || "");
            const bTime = Date.parse(b.timestamp || "");
            return (
              (Number.isNaN(bTime) ? 0 : bTime) -
              (Number.isNaN(aTime) ? 0 : aTime)
            );
          });
          setNotifications(mapped);
          setLoadFailed(false);
        } catch (retryError) {
          const finalError = retryError || error;
          const finalStatus = (finalError as any)?.status;
          // 503 = API not yet started (ECONNREFUSED during startup race) — expected.
          if (finalStatus !== 503) {
            console.error("Failed to fetch notifications:", finalError);
          }
          // Keep previous notifications to avoid badge flicker/disappear on intermittent failures.
          setLoadFailed(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [merchantId, isDemo]);

  useEffect(() => {
    fetchNotifications();
    // Fixed 30s interval. Do NOT include loadFailed in deps — changing loadFailed would
    // re-run this effect and immediately fire another request, creating a rapid burst loop.
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await portalApi.markPortalNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await portalApi.markAllPortalNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const clearNotification = async (id: string) => {
    try {
      await portalApi.deletePortalNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "conversation":
        return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case "order":
        return <ShoppingCart className="h-4 w-4 text-green-600" />;
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -left-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>الإشعارات</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto p-1"
              onClick={markAllAsRead}
            >
              تحديد الكل كمقروء
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
              <p>جاري التحميل...</p>
            </div>
          ) : loadFailed ? (
            <div className="py-8 text-center text-muted-foreground space-y-2">
              <p>تعذر تحميل الإشعارات حالياً</p>
              <Button variant="outline" size="sm" onClick={fetchNotifications}>
                إعادة المحاولة
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>لا توجد إشعارات</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 p-3 cursor-pointer",
                  !notification.read && "bg-muted/50",
                )}
                onClick={() => markAsRead(notification.id)}
              >
                <div className="mt-0.5">{getIcon(notification.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">
                      {notification.title}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearNotification(notification.id);
                      }}
                      className="p-1 hover:bg-muted rounded-md"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatRelativeTime(notification.timestamp)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="h-2 w-2 rounded-full bg-primary-600 mt-2" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
