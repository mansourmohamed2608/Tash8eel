"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  BookOpen,
  MessageSquare,
  Package,
  Settings,
  Users,
  BarChart3,
  LifeBuoy,
  Bell,
  Truck,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";
import { useEffect, useState } from "react";

const ICON_MAP: Record<string, any> = {
  BookOpen,
  Package,
  MessageSquare,
  BarChart3,
  Users,
  UserCog: Users,
  Truck,
  Store,
  Bell,
  Settings,
};

export default function HelpCenterPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi
      .getHelpCenterData()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="app-page-frame space-y-6 animate-fadeIn px-4 pb-8 sm:px-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const sections: any[] = data?.sections ?? [];
  const summary = data?.summary ?? {};

  return (
    <div className="app-page-frame space-y-6 animate-fadeIn px-4 pb-8 sm:px-6">
      <PageHeader
        title="مركز المساعدة"
        description="مسارات واضحة لتجهيز النظام وتشغيله بكفاءة"
        actions={
          <Link
            href="/merchant/onboarding"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            <LifeBuoy className="h-4 w-4" />
            العودة للبدء السريع
          </Link>
        }
      />

      {/* Summary Stats */}
      {(summary.totalProducts > 0 ||
        summary.totalOrders > 0 ||
        summary.totalCustomers > 0) && (
        <div className="app-workbench-strip flex flex-wrap gap-3 p-4">
          {summary.totalProducts > 0 && (
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {summary.totalProducts} منتج
            </Badge>
          )}
          {summary.totalOrders > 0 && (
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {summary.totalOrders} طلب
            </Badge>
          )}
          {summary.totalCustomers > 0 && (
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {summary.totalCustomers} عميل
            </Badge>
          )}
          {summary.unreadNotifications > 0 && (
            <Badge variant="destructive" className="text-sm py-1 px-3">
              {summary.unreadNotifications} إشعار غير مقروء
            </Badge>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section: any) => {
          const Icon = ICON_MAP[section.icon] ?? BookOpen;
          return (
            <Card key={section.id} className="app-data-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
                    <Icon className="h-5 w-5 shrink-0" />
                  </span>
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {section.description}
                </p>
                {section.metric && (
                  <p
                    className={cn(
                      "text-xs font-medium",
                      section.hasData ? "text-green-700" : "text-amber-600",
                    )}
                  >
                    {section.metric}
                  </p>
                )}
                <Link
                  href={section.href}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                  )}
                >
                  فتح القسم
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
