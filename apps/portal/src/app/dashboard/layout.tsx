"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { MobileNav } from "@/components/shell/MobileNav";
import { useSidebar } from "@/lib/hooks/useSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { collapsed, mounted, toggleCollapsed } = useSidebar();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const close = () => setMobileSidebarOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [mobileSidebarOpen]);

  return (
    <div className="tash-shell-theme">
      <div className="tash-app-shell">
        <Topbar onOpenSidebar={() => setMobileSidebarOpen(true)} />

        <div className="hidden lg:block">
          <Sidebar
            collapsed={mounted ? collapsed : false}
            onToggleCollapsed={toggleCollapsed}
          />
        </div>

        <main className="tash-main">
          <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
            {children}
          </div>
        </main>
      </div>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-[60] bg-[rgba(10,10,11,0.72)] lg:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
            <Sidebar
              collapsed={false}
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <MobileNav />
    </div>
  );
}
