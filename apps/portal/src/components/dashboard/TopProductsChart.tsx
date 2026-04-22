"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
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
import { topProducts } from "@/lib/constants/mockData";

export function TopProductsChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DashboardCard>
      <DashboardCardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
          أكثر المنتجات مبيعاً
        </h2>
        <span className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] px-2 py-1 text-[12px] text-[var(--text-secondary)]">
          اليوم
        </span>
      </DashboardCardHeader>
      <DashboardCardContent className="px-4 pb-5 pt-4 sm:px-5">
        {mounted ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={topProducts}
                margin={{ top: 0, right: 4, left: 4, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  width={92}
                  tick={{
                    fill: "var(--text-secondary)",
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2">
                        <p className="text-[13px] text-[var(--text-primary)]">
                          {payload[0].payload.name}
                        </p>
                        <p className="tash-latin mt-1 text-[11px] text-[var(--text-secondary)]">
                          {payload[0].value} طلب
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  barSize={20}
                  background={{ fill: "var(--bg-surface-3)", radius: 6 }}
                  animationDuration={800}
                >
                  {topProducts.map((product) => (
                    <Cell
                      key={product.name}
                      fill="var(--color-brand-primary)"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] rounded-[8px] tash-skeleton" />
        )}
      </DashboardCardContent>
    </DashboardCard>
  );
}
