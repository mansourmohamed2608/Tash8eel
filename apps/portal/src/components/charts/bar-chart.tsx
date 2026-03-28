"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/skeleton";

interface BarChartProps {
  data: Array<{ name: string; [key: string]: string | number }>;
  title?: string;
  bars?: Array<{ dataKey: string; color: string; name?: string }>;
  series?: Array<{ key: string; color: string; name?: string }>;
  loading?: boolean;
  className?: string;
  height?: number;
  stacked?: boolean;
}

export function BarChart({
  data,
  title,
  bars,
  series,
  loading,
  className,
  height = 300,
  stacked = false,
}: BarChartProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  const xInterval =
    data.length > 14 ? Math.max(1, Math.ceil(data.length / 12)) : 0;

  const fallbackColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
  ];
  const normalizedBars =
    bars ??
    series?.map((s) => ({
      dataKey: s.key,
      color: s.color,
      name: s.name ?? s.key,
    })) ??
    Object.keys(data?.[0] ?? {})
      .filter((k) => k !== "name" && k !== "label")
      .map((k, index) => ({
        dataKey: k,
        color: fallbackColors[index % fallbackColors.length],
        name: k,
      }));

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsBarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              interval={xInterval}
              tick={{ fill: "#6b7280", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
            />
            <Tooltip
              labelFormatter={(
                label: string | number,
                payload: Array<{ payload?: Record<string, unknown> }>,
              ) => {
                const tooltipLabel = payload?.[0]?.payload?.label;
                return typeof tooltipLabel === "string"
                  ? tooltipLabel
                  : String(label ?? "");
              }}
              cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                direction: "rtl",
                textAlign: "right",
                padding: "12px 16px",
              }}
              labelStyle={{
                color: "#111827",
                fontWeight: "600",
                marginBottom: "8px",
                display: "block",
              }}
              itemStyle={{
                color: "#374151",
                padding: "4px 0",
              }}
            />
            <Legend />
            {normalizedBars.map((bar) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name || bar.dataKey}
                fill={bar.color}
                radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
