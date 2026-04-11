"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  navigationSections,
  type NavigationSection,
} from "@/lib/constants/navigation";
import {
  SidebarItem,
  SidebarSectionTrigger,
} from "@/components/shell/SidebarItem";
import { DashboardButton } from "@/components/dashboard/Button";
import { cn } from "@/lib/utils";

function findExpandedSections(pathname: string) {
  const nextState: Record<string, boolean> = {};

  navigationSections.forEach((section) => {
    nextState[section.label] = section.items.some((item) =>
      pathname.startsWith(item.href),
    );
  });

  if (pathname === "/dashboard") {
    nextState["الرئيسية"] = true;
  }

  return nextState;
}

export function Sidebar({
  collapsed,
  mobile = false,
  onClose,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => findExpandedSections(pathname));

  useEffect(() => {
    setExpandedSections((current) => ({
      ...findExpandedSections(pathname),
      ...current,
    }));
  }, [pathname]);

  const workspaceFooterTime = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }, []);

  const toggleSection = (section: NavigationSection) => {
    setExpandedSections((current) => ({
      ...current,
      [section.label]: !current[section.label],
    }));
  };

  return (
    <motion.aside
      initial={false}
      animate={
        mobile
          ? { width: "100%", minWidth: "100%" }
          : { width: collapsed ? 64 : 260, minWidth: collapsed ? 64 : 260 }
      }
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "tash-sidebar tash-scrollbar",
        collapsed && !mobile && "tash-sidebar--collapsed",
        mobile && "tash-sidebar--mobile",
      )}
    >
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <AnimatePresence initial={false}>
          {!collapsed || mobile ? (
            <motion.div
              key="workspace-meta"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeInOut" }}
              className="min-w-0"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Workspace
              </p>
              <p className="mt-1 text-[15px] font-bold text-[var(--text-primary)]">
                تشغيل
              </p>
              <p className="mt-1 font-[var(--font-body)] text-[11px] text-[var(--text-secondary)]">
                متجر تشغيل التجريبي
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-success)]" />
                <span className="text-[var(--accent-success)]">متصل</span>
                <span className="tash-latin text-[10px] text-[var(--text-muted)]">
                  آخر فحص: {workspaceFooterTime}
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {onToggleCollapsed && !mobile ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-secondary)] transition duration-150 ease-in hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-3 px-2 py-2">
        {navigationSections.map((section) => {
          const expanded = expandedSections[section.label];

          return (
            <div key={section.label} className="space-y-1">
              <SidebarSectionTrigger
                label={section.label}
                icon={section.icon}
                expanded={expanded}
                collapsed={collapsed && !mobile}
                onClick={() => toggleSection(section)}
              />
              {(expanded || (collapsed && !mobile)) && (
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <SidebarItem
                      key={item.label}
                      item={item}
                      active={
                        pathname === item.href ||
                        (item.href !== "/dashboard" &&
                          pathname.startsWith(item.href))
                      }
                      collapsed={collapsed && !mobile}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border-subtle)] p-3">
        <DashboardButton
          variant="secondary"
          className={cn(
            "w-full justify-center border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--accent-danger)] hover:text-[var(--accent-danger)]",
            collapsed && !mobile && "h-9 px-0",
          )}
        >
          <LogOut className="h-4 w-4" />
          {collapsed && !mobile ? null : <span>تسجيل الخروج</span>}
        </DashboardButton>
      </div>
    </motion.aside>
  );
}
