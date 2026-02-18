"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout";
import { TopBar } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-muted/30">
        <Sidebar role="admin" />
        <div
          className={cn(
            "transition-all duration-300",
            collapsed ? "lg:mr-16" : "lg:mr-64",
          )}
        >
          <TopBar role="admin" collapsed={collapsed} />
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
