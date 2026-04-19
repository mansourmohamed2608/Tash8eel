"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tash8eel-dashboard-sidebar";

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;

    if (saved === "true" || saved === "false") {
      setCollapsed(saved === "true");
    } else if (typeof window !== "undefined") {
      setCollapsed(window.innerWidth < 1280);
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  const toggleCollapsed = () => setCollapsed((current) => !current);

  return useMemo(
    () => ({
      collapsed,
      mounted,
      setCollapsed,
      toggleCollapsed,
    }),
    [collapsed, mounted],
  );
}
