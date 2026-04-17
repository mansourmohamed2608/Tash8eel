"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Award,
  BarChart3,
  PieChart,
  LineChart,
  Users,
  ShoppingCart,
  DollarSign,
  Package,
  Clock,
  Calendar,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Metric Card with Trend
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  format?: "number" | "currency" | "percent";
  description?: string;
  className?: string;
  loading?: boolean;
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  trend,
  format = "number",
  description,
  className,
  loading,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-6">
          <div className="h-20 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="h-4 w-4" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600 bg-green-50";
    if (trend === "down") return "text-red-600 bg-red-50";
    return "text-gray-600 bg-gray-50";
  };

  const formatValue = (val: string | number) => {
    if (typeof val === "string") return val;
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("ar-SA", {
          style: "currency",
          currency: "SAR",
          maximumFractionDigits: 0,
        }).format(val);
      case "percent":
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat("ar-SA").format(val);
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{formatValue(value)}</p>
            {change !== undefined && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                    getTrendColor(),
                  )}
                >
                  {getTrendIcon()}
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(1)}%
                </span>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground">
                    {changeLabel}
                  </span>
                )}
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {icon && (
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Funnel Chart Component
interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  title?: string;
  showPercentages?: boolean;
}

export function FunnelChart({
  steps,
  title,
  showPercentages = true,
}: FunnelChartProps) {
  const maxValue = Math.max(...steps.map((s) => s.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title || "قمع التحويل"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, index) => {
          const percentage = (step.value / maxValue) * 100;
          const conversionRate =
            index > 0
              ? ((step.value / steps[index - 1].value) * 100).toFixed(1)
              : 100;

          return (
            <div key={step.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">
                    {new Intl.NumberFormat("ar-SA").format(step.value)}
                  </span>
                  {showPercentages && index > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {conversionRate}%
                    </Badge>
                  )}
                </div>
              </div>
              <div className="relative">
                <div className="h-8 bg-muted rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-lg transition-all duration-500",
                      step.color || "bg-primary",
                    )}
                    style={{
                      width: `${percentage}%`,
                      clipPath:
                        index < steps.length - 1
                          ? `polygon(0 0, 100% 0, 95% 100%, 0 100%)`
                          : undefined,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// Performance Score Card
interface PerformanceScoreProps {
  score: number;
  label: string;
  maxScore?: number;
  breakdown?: Array<{ label: string; score: number; maxScore: number }>;
  recommendation?: string;
}

export function PerformanceScore({
  score,
  label,
  maxScore = 100,
  breakdown,
  recommendation,
}: PerformanceScoreProps) {
  const percentage = (score / maxScore) * 100;

  const getScoreColor = () => {
    if (percentage >= 80) return "text-[var(--accent-success)]";
    if (percentage >= 60) return "text-[var(--accent-warning)]";
    return "text-[var(--accent-danger)]";
  };

  const getScoreLabel = () => {
    if (percentage >= 80) return "ممتاز";
    if (percentage >= 60) return "جيد";
    if (percentage >= 40) return "متوسط";
    return "يحتاج تحسين";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Score */}
        <div className="flex items-center justify-center">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-muted"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${percentage * 3.52} 352`}
                className={getScoreColor()}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-3xl font-bold", getScoreColor())}>
                {score}
              </span>
              <span className="text-xs text-muted-foreground">
                من {maxScore}
              </span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Badge
            className={cn("text-sm", getScoreColor().replace("text", "bg"))}
          >
            {getScoreLabel()}
          </Badge>
        </div>

        {/* Breakdown */}
        {breakdown && breakdown.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            {breakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{item.label}</span>
                  <span className="font-medium">
                    {item.score}/{item.maxScore}
                  </span>
                </div>
                <Progress
                  value={(item.score / item.maxScore) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        )}

        {/* Recommendation */}
        {recommendation && (
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-sm text-muted-foreground">{recommendation}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Comparison Card
interface ComparisonCardProps {
  title: string;
  current: { label: string; value: number };
  previous: { label: string; value: number };
  format?: "number" | "currency" | "percent";
  icon?: React.ReactNode;
}

export function ComparisonCard({
  title,
  current,
  previous,
  format = "number",
  icon,
}: ComparisonCardProps) {
  const change =
    previous.value !== 0
      ? ((current.value - previous.value) / previous.value) * 100
      : current.value > 0
        ? 100
        : 0;

  const formatValue = (val: number) => {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("ar-SA", {
          style: "currency",
          currency: "SAR",
          maximumFractionDigits: 0,
        }).format(val);
      case "percent":
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat("ar-SA").format(val);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
          {icon}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {current.label}
            </p>
            <p className="text-2xl font-bold">{formatValue(current.value)}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-muted-foreground mb-1">
              {previous.label}
            </p>
            <p className="text-2xl font-bold text-muted-foreground">
              {formatValue(previous.value)}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            {change >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-[var(--accent-success)]" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-[var(--accent-danger)]" />
            )}
            <span
              className={cn(
                "text-sm font-medium",
                change >= 0
                  ? "text-[var(--accent-success)]"
                  : "text-[var(--accent-danger)]",
              )}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">
              مقارنة بالفترة السابقة
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// KPI Grid Component
interface KPIGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}

export function KPIGrid({ children, columns = 4 }: KPIGridProps) {
  const colsClass = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return <div className={cn("grid gap-4", colsClass[columns])}>{children}</div>;
}

// Mini Sparkline Component
interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({
  data,
  color = "currentColor",
  height = 24,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = ((max - value) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="100%" height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Goal Progress Card
interface GoalProgressCardProps {
  goals: Array<{
    id: string;
    label: string;
    current: number;
    target: number;
    unit?: string;
  }>;
  title?: string;
}

export function GoalProgressCard({
  goals,
  title = "الأهداف",
}: GoalProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((goal) => {
          const percentage = Math.min((goal.current / goal.target) * 100, 100);
          const isComplete = percentage >= 100;

          return (
            <div key={goal.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{goal.label}</span>
                <span className="text-muted-foreground">
                  {goal.current.toLocaleString("ar-SA")}
                  {goal.unit && ` ${goal.unit}`} /{" "}
                  {goal.target.toLocaleString("ar-SA")}
                  {goal.unit && ` ${goal.unit}`}
                </span>
              </div>
              <div className="relative">
                <Progress
                  value={percentage}
                  className={cn("h-2", isComplete && "bg-green-100")}
                />
                {isComplete && (
                  <Badge className="absolute -top-1 left-0 bg-green-500 text-xs">
                    ✓ مكتمل
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// Time Range Selector
interface TimeRangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
}

export function TimeRangeSelector({
  value,
  onChange,
  options = [
    { value: "7", label: "آخر 7 أيام" },
    { value: "30", label: "آخر 30 يوم" },
    { value: "90", label: "آخر 90 يوم" },
    { value: "365", label: "السنة الماضية" },
  ],
}: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

// Insight Card Component
interface InsightCardProps {
  type: "success" | "warning" | "info" | "danger";
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function InsightCard({
  type,
  title,
  description,
  action,
}: InsightCardProps) {
  const typeConfig = {
    success: {
      bg: "bg-[var(--success-muted)] border-[color:color-mix(in_srgb,var(--accent-success)_20%,transparent)]",
      icon: <TrendingUp className="h-5 w-5 text-[var(--accent-success)]" />,
      titleColor: "text-[var(--accent-success)]",
    },
    warning: {
      bg: "bg-[var(--warning-muted)] border-[color:color-mix(in_srgb,var(--accent-warning)_20%,transparent)]",
      icon: <Info className="h-5 w-5 text-[var(--accent-warning)]" />,
      titleColor: "text-[var(--accent-warning)]",
    },
    info: {
      bg: "bg-[var(--info-muted)] border-[color:color-mix(in_srgb,var(--info)_20%,transparent)]",
      icon: <Sparkles className="h-5 w-5 text-[var(--info)]" />,
      titleColor: "text-[var(--info)]",
    },
    danger: {
      bg: "bg-[var(--danger-muted)] border-[color:color-mix(in_srgb,var(--accent-danger)_20%,transparent)]",
      icon: <TrendingDown className="h-5 w-5 text-[var(--accent-danger)]" />,
      titleColor: "text-[var(--accent-danger)]",
    },
  };

  const config = typeConfig[type];

  return (
    <div className={cn("p-4 rounded-lg border", config.bg)}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1">
          <h4 className={cn("font-medium", config.titleColor)}>{title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {action && (
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto mt-2"
              onClick={action.onClick}
            >
              {action.label}
              <ChevronRight className="h-3 w-3 mr-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
