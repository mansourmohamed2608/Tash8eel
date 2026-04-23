"use client";

import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  HelpCircle,
  Package,
  MessageSquare,
  Settings,
  Users,
  BarChart3,
  BookOpen,
  CreditCard,
  Bell,
  Truck,
  Store,
  Wifi,
} from "lucide-react";

const STEP_ICONS: Record<string, any> = {
  business_info: Settings,
  whatsapp: Wifi,
  products: Package,
  inventory: BarChart3,
  knowledge_base: BookOpen,
  first_conversation: MessageSquare,
  first_order: CreditCard,
  payments: CreditCard,
  team: Users,
  notifications: Bell,
  integrations: Store,
  delivery_drivers: Truck,
};

export default function OnboardingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi
      .getOnboardingStatus()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const steps: any[] = data?.steps ?? [];
  const summary = data?.summary ?? {
    completionPct: 0,
    completedRequired: 0,
    requiredSteps: 0,
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="البدء السريع"
        description="خطوات بسيطة لتجهيز النظام لعملك"
        actions={
          <Link
            href="/merchant/help"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            <HelpCircle className="h-4 w-4" />
            مركز المساعدة
          </Link>
        }
      />

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium">
              {summary.isComplete
                ? "🎉 تم إعداد النظام بالكامل!"
                : `${summary.completedRequired} من ${summary.requiredSteps} خطوة مكتملة`}
            </span>
            <span className="text-muted-foreground">
              {summary.completionPct}%
            </span>
          </div>
          <Progress value={summary.completionPct} className="h-2.5" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((step: any) => {
          const Icon = STEP_ICONS[step.id] ?? Circle;
          return (
            <Link key={step.id} href={step.href}>
              <Card
                className={cn(
                  "cursor-pointer transition-shadow hover:shadow-md h-full",
                  step.completed &&
                    "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20",
                )}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {step.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <span>{step.title}</span>
                    {step.optional && (
                      <span className="mr-auto text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        اختياري
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                  <div
                    className={cn(
                      "text-xs font-medium",
                      step.completed ? "text-green-700" : "text-amber-600",
                    )}
                  >
                    {step.metric}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>نصائح سريعة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• فعّل الإشعارات المهمة لتفادي نفاد المخزون أو تأخير الطلبات.</p>
          <p>• راجع لوحة التقارير والمؤشرات لفهم الأداء واتخاذ قرارات أسرع.</p>
          <p>• أضف قاعدة المعرفة ليتعلم الذكاء الاصطناعي عن سياساتك وأسعارك.</p>
        </CardContent>
      </Card>
    </div>
  );
}
