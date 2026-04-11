"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Menu, Search, X } from "lucide-react";
import { DashboardInput } from "@/components/dashboard/Input";
import { DashboardButton } from "@/components/dashboard/Button";

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <g fill="var(--accent-gold)">
        <rect
          x="1.5"
          y="1.5"
          width="7"
          height="7"
          rx="1.6"
          transform="rotate(-6 5 5)"
        />
        <rect
          x="11.5"
          y="1.5"
          width="7"
          height="7"
          rx="1.6"
          transform="rotate(6 15 5)"
        />
        <rect
          x="1.5"
          y="11.5"
          width="7"
          height="7"
          rx="1.6"
          transform="rotate(6 5 15)"
        />
        <rect
          x="11.5"
          y="11.5"
          width="7"
          height="7"
          rx="1.6"
          transform="rotate(-6 15 15)"
        />
      </g>
    </svg>
  );
}

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const lastStatus = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    [],
  );

  return (
    <>
      <header className="tash-topbar">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-secondary)] lg:hidden"
            onClick={onOpenSidebar}
            aria-label="فتح القائمة"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link href="/dashboard" className="flex items-start gap-2">
            <span className="mt-[2px]">
              <LogoMark />
            </span>
            <span className="relative inline-flex items-start gap-1 text-[16px] font-bold text-[var(--text-primary)]">
              تشغيل
              <span className="relative -top-1 rounded-[4px] bg-[var(--accent-gold)] px-1.5 py-[2px] text-[10px] font-bold text-[#0A0A0B]">
                AI
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden w-full max-w-[400px] flex-1 px-6 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--text-muted)]" />
            <DashboardInput
              placeholder="ابحث في الطلبات، العملاء، المنتجات... ⌘K"
              className="h-[34px] bg-[var(--bg-surface-3)] pr-9 pl-12 text-[13px]"
            />
            <span className="tash-latin pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              ⌘K
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-secondary)] md:hidden"
            aria-label="فتح البحث"
          >
            <Search className="h-4 w-4" />
          </button>

          <div className="hidden items-center gap-2 text-[12px] text-[var(--text-secondary)] md:flex">
            <span className="tash-live-dot" />
            <span>النظام يعمل</span>
          </div>

          <div className="hidden h-5 w-px bg-[var(--border-subtle)] md:block" />

          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-secondary)]"
            aria-label="الإشعارات"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute left-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-[4px] bg-[var(--accent-gold)] px-1 text-[10px] font-bold text-[#0A0A0B]">
              6
            </span>
          </button>

          <div className="hidden h-5 w-px bg-[var(--border-subtle)] sm:block" />

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[11px] font-semibold text-[var(--text-secondary)]"
            >
              م.أ
            </button>

            {profileOpen ? (
              <div className="absolute left-0 top-10 z-30 w-40 overflow-hidden rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                {["الملف الشخصي", "تغيير كلمة المرور", "تسجيل الخروج"].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className="flex h-9 w-full items-center px-3 text-right text-[13px] text-[var(--text-secondary)] transition duration-150 ease-in hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {mobileSearchOpen ? (
        <div className="fixed inset-0 z-[70] bg-[rgba(10,10,11,0.92)] p-4 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--text-muted)]" />
              <DashboardInput
                autoFocus
                placeholder="ابحث في الطلبات، العملاء، المنتجات... ⌘K"
                className="h-11 pr-9"
              />
            </div>
            <DashboardButton
              variant="ghost"
              size="icon"
              onClick={() => setMobileSearchOpen(false)}
            >
              <X className="h-4 w-4" />
            </DashboardButton>
          </div>
          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 text-[13px] text-[var(--text-secondary)]">
            ابدأ بالبحث عن طلب، عميل، منتج، أو قناة تواصل.
            <div className="tash-latin mt-2 text-[11px] text-[var(--text-muted)]">
              آخر فحص: {lastStatus}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
