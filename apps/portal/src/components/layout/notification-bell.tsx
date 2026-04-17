"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";

interface Notification {
  id: string;
  type: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  priority: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

const getPriorityStyles = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "border-l-4 border-l-[var(--accent-danger)] bg-[var(--danger-muted)]";
    case "HIGH":
      return "border-l-4 border-l-[var(--accent-warning)] bg-[var(--warning-muted)]";
    case "MEDIUM":
      return "border-l-4 border-l-[var(--accent-blue)] bg-[var(--accent-muted)]";
    default:
      return "border-l-4 border-l-[var(--border-default)] bg-[var(--bg-surface-2)]";
  }
};

export function NotificationBell() {
  const { merchantId } = useMerchant();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!merchantId) return;

    const loadNotifications = async () => {
      const isAuthFailure = (error: unknown) => {
        const status = (error as any)?.status;
        const code = (error as any)?.code;
        return (
          status === 401 ||
          code === "AUTH_RECOVERING" ||
          code === "SESSION_EXPIRED"
        );
      };

      let response: any = null;
      try {
        response = await portalApi.getPortalNotifications({
          unreadOnly: false,
        });
      } catch (err) {
        if (isAuthFailure(err)) {
          throw err;
        }
        console.warn("[bell] getPortalNotifications failed:", err);
        response = null;
      }

      if (!response?.notifications?.length && merchantId) {
        try {
          response = await portalApi.getNotifications(merchantId, {
            unreadOnly: false,
            limit: 50,
            offset: 0,
          });
        } catch (err) {
          if (isAuthFailure(err)) {
            throw err;
          }
          console.error("[bell] getNotifications fallback failed:", err);
          throw err;
        }
      }

      const rows = (response?.notifications || []) as any[];
      const mapped: Notification[] = rows.map((item: any) => ({
        id: String(item?.id || ""),
        type: String(item?.type || "SYSTEM_ALERT"),
        title: String(item?.title || item?.titleAr || "Notification"),
        titleAr: String(item?.titleAr || item?.title || "إشعار"),
        message: String(item?.message || item?.messageAr || ""),
        messageAr: String(item?.messageAr || item?.message || ""),
        priority: String(item?.priority || "LOW"),
        isRead: Boolean(item?.isRead ?? item?.read ?? false),
        actionUrl: item?.actionUrl || undefined,
        createdAt: String(
          item?.createdAt || item?.timestamp || new Date().toISOString(),
        ),
      }));
      const sorted = [...mapped].sort((a, b) => {
        const aTime = Date.parse(a.createdAt || "");
        const bTime = Date.parse(b.createdAt || "");
        return (
          (Number.isFinite(bTime) ? bTime : 0) -
          (Number.isFinite(aTime) ? aTime : 0)
        );
      });
      const computedUnread = sorted.filter((item) => !item.isRead).length;
      const unreadFromApi = Number(response?.unreadCount);
      return {
        notifications: sorted,
        unreadCount: Number.isFinite(unreadFromApi)
          ? unreadFromApi
          : computedUnread,
      };
    };

    setLoading(true);
    try {
      const result = await loadNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      console.error("[bell] first attempt failed, retrying:", err);
      try {
        const result = await loadNotifications();
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      } catch (retryErr) {
        console.error("[bell] retry also failed:", retryErr);
        // silently ignore - bell keeps showing whatever was last loaded
      }
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  // Re-run whenever merchantLoading flips to false (session becomes available)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Refresh data every time the user opens the popover
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!merchantId) return;
    try {
      await portalApi.markNotificationRead(merchantId, notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!merchantId) return;
    try {
      await portalApi.markAllNotificationsRead(merchantId);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-danger)] text-[10px] font-bold text-white animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold">الإشعارات</h4>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={handleMarkAllAsRead}
              >
                <Check className="h-3 w-3 ml-1" />
                قراءة الكل
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BellOff className="h-12 w-12 mb-4 opacity-50" />
              <p>لا توجد إشعارات</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer",
                    !notification.isRead &&
                      getPriorityStyles(notification.priority),
                  )}
                  onClick={() => {
                    if (!notification.isRead) {
                      handleMarkAsRead(notification.id);
                    }
                    if (notification.actionUrl) {
                      setOpen(false);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          !notification.isRead && "text-primary",
                        )}
                      >
                        {notification.titleAr}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notification.messageAr}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </p>
                    </div>
                    {notification.actionUrl && (
                      <Link
                        href={notification.actionUrl}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2">
          <Link href="/merchant/notifications" onClick={() => setOpen(false)}>
            <Button variant="ghost" className="w-full text-sm">
              عرض كل الإشعارات
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
