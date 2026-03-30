"use client";

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/skeleton";

interface AreaChartProps {
  data: Array<{ name: string; [key: string]: string | number }>;
  title?: string;
  dataKey?: string;
  color?: string;
  series?: Array<{ key: string; color: string; name?: string }>;
  loading?: boolean;
  className?: string;
  height?: number;
}

export function AreaChart({
  data,
  title,
  dataKey = "value",
  color = "#3b82f6",
  series,
  loading,
  className,
  height = 300,
}: AreaChartProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  const xInterval =
    data.length > 14 ? Math.max(1, Math.ceil(data.length / 12)) : 0;
  const chartSeries =
    series && series.length > 0
      ? series
      : [{ key: dataKey, color, name: dataKey }];
  const gradientIdFor = (key: string) =>
    `gradient-${String(key).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <Card className={cn(className)}>
      {title ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsAreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              {chartSeries.map((s) => (
                <linearGradient
                  key={s.key}
                  id={gradientIdFor(s.key)}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
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
              labelFormatter={(label: any, payload: any) => {
                const tooltipLabel = payload?.[0]?.payload?.label;
                return typeof tooltipLabel === "string"
                  ? tooltipLabel
                  : String(label ?? "");
              }}
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            {chartSeries.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#${gradientIdFor(s.key)})`}
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
