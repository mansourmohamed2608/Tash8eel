"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout";
import { TopBar } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RealTimeEvent, useWebSocket } from "@/hooks/use-websocket";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [liveRevision, setLiveRevision] = useState(0);
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected, on } = useWebSocket({
    autoConnect: true,
    subscribeToEvents: [
      RealTimeEvent.ORDER_CREATED,
      RealTimeEvent.ORDER_UPDATED,
      RealTimeEvent.ORDER_STATUS_CHANGED,
      RealTimeEvent.ORDER_CANCELLED,
      RealTimeEvent.DELIVERY_STATUS_UPDATED,
      RealTimeEvent.DELIVERY_COMPLETED,
      RealTimeEvent.MESSAGE_RECEIVED,
      RealTimeEvent.MESSAGE_SENT,
      RealTimeEvent.CONVERSATION_STARTED,
      RealTimeEvent.CONVERSATION_CLOSED,
      RealTimeEvent.NOTIFICATION,
      RealTimeEvent.ALERT,
      RealTimeEvent.STATS_UPDATED,
      RealTimeEvent.REVENUE_UPDATED,
      RealTimeEvent.STOCK_UPDATED,
      RealTimeEvent.STOCK_LOW,
      RealTimeEvent.STOCK_OUT,
    ],
  });

  const triggerRealtimeRefresh = useCallback(() => {
    if (!pathname) return;

    setLiveRevision((prev) => prev + 1);
    router.refresh();

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:realtime-data-changed", {
          detail: { scope: "admin", path: pathname, at: Date.now() },
        }),
      );
    }
  }, [pathname, router]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current) return;

    liveRefreshTimerRef.current = setTimeout(() => {
      liveRefreshTimerRef.current = null;
      triggerRealtimeRefresh();
    }, 1000);
  }, [triggerRealtimeRefresh]);

  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      on(RealTimeEvent.ORDER_CREATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_STATUS_CHANGED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_CANCELLED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.DELIVERY_STATUS_UPDATED, () =>
        scheduleRealtimeRefresh(),
      ),
      on(RealTimeEvent.DELIVERY_COMPLETED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.MESSAGE_RECEIVED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.MESSAGE_SENT, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.CONVERSATION_STARTED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.CONVERSATION_CLOSED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.NOTIFICATION, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ALERT, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STATS_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.REVENUE_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_LOW, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_OUT, () => scheduleRealtimeRefresh()),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [isConnected, on, scheduleRealtimeRefresh]);

  useEffect(() => {
    if (isConnected) return;

    const interval = setInterval(() => {
      scheduleRealtimeRefresh();
    }, 60000);

    return () => clearInterval(interval);
  }, [isConnected, scheduleRealtimeRefresh]);

  useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="app-shell">
        <Sidebar
          role="admin"
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
        <div
          className={cn(
            "transition-all duration-300",
            collapsed ? "lg:mr-[88px]" : "lg:mr-72",
          )}
        >
          <TopBar role="admin" collapsed={collapsed} />
          <main key={liveRevision} className="app-shell-main p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
