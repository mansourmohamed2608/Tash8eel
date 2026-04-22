"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DashboardCard,
  DashboardCardContent,
  DashboardCardHeader,
} from "@/components/dashboard/Card";
import { revenueSeries } from "@/lib/constants/mockData";

const tabs = ["اليوم", "الأسبوع", "الشهر"] as const;

function formatRevenue(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} ج.م`;
}

export function RevenueChart() {
  const [activeRange, setActiveRange] =
    useState<(typeof tabs)[number]>("اليوم");
  const [mounted, setMounted] = useState(false);

  const data = useMemo(() => revenueSeries[activeRange], [activeRange]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DashboardCard className="h-full">
      <DashboardCardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
            المبيعات
          </h2>
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveRange(tab)}
              className={`rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-medium transition duration-150 ease-in ${
                activeRange === tab
                  ? "border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </DashboardCardHeader>

      <DashboardCardContent className="px-4 pb-4 pt-4 sm:px-5">
        {mounted ? (
          <div className="h-[180px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 12, right: 12, left: 12, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id="tashRevenueFill"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-brand-primary)"
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-brand-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border-subtle)"
                  strokeDasharray="0"
                />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--text-muted)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--text-muted)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("en-US", {
                      notation: "compact",
                    }).format(value)
                  }
                />
                <Tooltip
                  cursor={{ stroke: "var(--border-default)", strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2">
                        <p className="tash-latin text-[11px] text-[var(--text-muted)]">
                          {label}
                        </p>
                        <p className="mt-1 text-[13px] text-[var(--text-primary)]">
                          المبيعات:{" "}
                          <span className="tash-latin">
                            {formatRevenue(Number(payload[0].value || 0))}
                          </span>
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-brand-primary)"
                  strokeWidth={2}
                  fill="url(#tashRevenueFill)"
                  dot={false}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[180px] rounded-[8px] tash-skeleton sm:h-[220px]" />
        )}
      </DashboardCardContent>
    </DashboardCard>
  );
}
