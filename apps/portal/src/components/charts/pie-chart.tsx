"use client";

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/skeleton";

interface PieChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  title: string;
  loading?: boolean;
  className?: string;
  height?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "#22c55e", // green - completed
  "#3b82f6", // blue - shipping
  "#f59e0b", // yellow - pending
  "#ef4444", // red - cancelled
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export function PieChart({
  data,
  title,
  loading,
  className,
  height = 300,
  colors = DEFAULT_COLORS,
}: PieChartProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  const aggregated = new Map<
    string,
    { name: string; value: number; color?: string }
  >();
  for (const item of data) {
    const value = Number(item?.value || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    const name = String(item?.name || "").trim() || "غير معروف";
    const key = name.toLowerCase();
    const existing = aggregated.get(key);
    if (existing) {
      existing.value += value;
      if (!existing.color && item.color) existing.color = item.color;
    } else {
      aggregated.set(key, { name, value, color: item.color });
    }
  }

  const chartData = Array.from(aggregated.values())
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({
      ...item,
      color: item.color || colors[index % colors.length],
    }));

  if (chartData.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            لا توجد بيانات للفترة المحددة
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              label={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                direction: "rtl",
              }}
              formatter={(value, name) => [
                Number(value || 0).toLocaleString("ar-EG"),
                String(name || ""),
              ]}
            />
          </RechartsPieChart>
        </ResponsiveContainer>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {chartData.map((item, index) => (
            <div
              key={`legend-${item.name}-${index}`}
              className="inline-flex items-center gap-1.5"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.name}</span>
              <span className="text-[11px]">
                ({Number(item.value || 0).toLocaleString("ar-EG")})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
