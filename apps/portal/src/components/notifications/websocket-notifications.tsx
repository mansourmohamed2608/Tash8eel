"use client";

import { useEffect, useState } from "react";
import { useWebSocket, RealTimeEvent } from "@/hooks/use-websocket";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  AlertCircle,
  Info,
  XCircle,
  X,
  Bell,
  ShoppingCart,
  Package,
  MessageSquare,
} from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  action?: { label: string; url: string };
  timestamp: Date;
  read: boolean;
}

interface ToastNotificationProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

function ToastNotification({
  notification,
  onDismiss,
}: ToastNotificationProps) {
  const icons = {
    info: <Info className="h-5 w-5 text-[var(--accent-blue)]" />,
    success: <CheckCircle className="h-5 w-5 text-[var(--accent-success)]" />,
    warning: <AlertCircle className="h-5 w-5 text-[var(--accent-warning)]" />,
    error: <XCircle className="h-5 w-5 text-[var(--accent-danger)]" />,
  };

  const bgColors = {
    info: "bg-[color:rgba(59,130,246,0.10)] border-[color:rgba(59,130,246,0.24)]",
    success:
      "bg-[color:rgba(34,197,94,0.10)] border-[color:rgba(34,197,94,0.24)]",
    warning:
      "bg-[color:rgba(245,158,11,0.10)] border-[color:rgba(245,158,11,0.24)]",
    error:
      "bg-[color:rgba(239,68,68,0.10)] border-[color:rgba(239,68,68,0.24)]",
  };

  return (
    <div
      className={cn(
        "animate-slide-in-right flex items-start gap-3 rounded-lg border p-4",
        bgColors[notification.type],
      )}
    >
      {icons[notification.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {notification.title}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {notification.message}
        </p>
        {notification.action && (
          <a
            href={notification.action.url}
            className="mt-2 inline-block text-xs text-[var(--accent-gold)] hover:underline"
          >
            {notification.action.label} ←
          </a>
        )}
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function WebSocketNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { isConnected, on } = useWebSocket({ autoConnect: true });

  // Listen for notifications
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on<{
      title: string;
      message: string;
      type: "info" | "success" | "warning" | "error";
      action?: { label: string; url: string };
    }>(RealTimeEvent.NOTIFICATION, (payload) => {
      const newNotification: Notification = {
        id: `notif-${Date.now()}`,
        ...payload.data,
        timestamp: new Date(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev].slice(0, 5));

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== newNotification.id),
        );
      }, 5000);
    });

    return unsubscribe;
  }, [isConnected, on]);

  // Listen for order events
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeOrder = on<{
      orderId: string;
      orderNumber: string;
      customerName: string;
      total: number;
    }>(RealTimeEvent.ORDER_CREATED, (payload) => {
      const newNotification: Notification = {
        id: `order-${Date.now()}`,
        title: "طلب جديد! 🎉",
        message: `${payload.data.customerName} - ${payload.data.orderNumber}`,
        type: "success",
        action: {
          label: "عرض الطلب",
          url: `/merchant/orders/${payload.data.orderId}`,
        },
        timestamp: new Date(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev].slice(0, 5));

      setTimeout(() => {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== newNotification.id),
        );
      }, 8000);
    });

    return unsubscribeOrder;
  }, [isConnected, on]);

  // Listen for message events
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeMessage = on<{
      conversationId: string;
      customerName: string;
      content: string;
    }>(RealTimeEvent.MESSAGE_RECEIVED, (payload) => {
      const newNotification: Notification = {
        id: `msg-${Date.now()}`,
        title: "رسالة جديدة 💬",
        message: `${payload.data.customerName}: ${payload.data.content.slice(0, 50)}...`,
        type: "info",
        action: {
          label: "عرض المحادثة",
          url: `/merchant/conversations/${payload.data.conversationId}`,
        },
        timestamp: new Date(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev].slice(0, 5));

      setTimeout(() => {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== newNotification.id),
        );
      }, 6000);
    });

    return unsubscribeMessage;
  }, [isConnected, on]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((notification) => (
        <ToastNotification
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  );
}
