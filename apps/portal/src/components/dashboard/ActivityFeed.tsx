"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Bell, CreditCard, ShoppingCart, UserPlus } from "lucide-react";
import {
  DashboardCard,
  DashboardCardContent,
  DashboardCardHeader,
} from "@/components/dashboard/Card";
import {
  activityLiveQueue,
  initialActivityFeed,
  type ActivityEvent,
} from "@/lib/constants/mockData";

type ActivityFeedItem = ActivityEvent & {
  fresh?: boolean;
};

const iconMap = {
  ai: {
    icon: Bot,
    className: "bg-[var(--accent-gold-dim)] text-[var(--accent-gold)]",
  },
  order: {
    icon: ShoppingCart,
    className: "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]",
  },
  inventory: {
    icon: Bell,
    className: "bg-[rgba(245,158,11,0.12)] text-[var(--accent-warning)]",
  },
  payment: {
    icon: CreditCard,
    className: "bg-[rgba(34,197,94,0.12)] text-[var(--accent-success)]",
  },
  customer: {
    icon: UserPlus,
    className: "bg-[rgba(59,130,246,0.12)] text-[var(--accent-blue)]",
  },
};

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityFeedItem[]>(initialActivityFeed);
  const [queueIndex, setQueueIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = activityLiveQueue[queueIndex % activityLiveQueue.length];
      const nextItem: ActivityFeedItem = {
        ...next,
        id: `${next.id}-${Date.now()}`,
        fresh: true,
      };

      setItems((current) =>
        [nextItem, ...current.map((item) => ({ ...item, fresh: false }))].slice(
          0,
          10,
        ),
      );
      setQueueIndex((current) => current + 1);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [queueIndex]);

  return (
    <DashboardCard>
      <DashboardCardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
            النشاط الأخير
          </h2>
          <span className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <span className="tash-live-dot" />
            مباشر
          </span>
        </div>
      </DashboardCardHeader>
      <DashboardCardContent className="space-y-0 px-5 py-2">
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const { icon: Icon, className } = iconMap[item.icon];

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className={`relative flex gap-3 py-3 ${item.fresh ? "tash-activity-fresh" : ""}`}
              >
                {index < items.length - 1 ? (
                  <span className="absolute right-[13px] top-10 h-[calc(100%-16px)] border-r border-dashed border-[var(--border-subtle)]" />
                ) : null}
                <span
                  className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] ${className}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-[var(--font-body)] text-[13px] leading-[1.8] text-[var(--text-secondary)]">
                    {item.text}
                  </p>
                </div>
                <span className="tash-latin shrink-0 text-[11px] text-[var(--text-muted)]">
                  {item.time}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </DashboardCardContent>
    </DashboardCard>
  );
}
