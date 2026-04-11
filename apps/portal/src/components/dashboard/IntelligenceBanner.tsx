"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import { useIntelligenceBanner } from "@/lib/hooks/useIntelligenceBanner";

export function IntelligenceBanner() {
  const { currentMessage, index } = useIntelligenceBanner();

  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] [border-inline-end:2px_solid_var(--accent-gold)] bg-[var(--bg-surface-2)] px-4">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <Bot className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="truncate text-[13px] text-[var(--text-secondary)] sm:whitespace-nowrap"
          >
            {currentMessage.text}
          </motion.p>
        </AnimatePresence>
      </div>
      <Link
        href="/merchant/assistant"
        className="shrink-0 text-[12px] text-[var(--text-secondary)] transition duration-150 ease-in hover:underline hover:text-[var(--text-primary)]"
      >
        عرض الكل
      </Link>
    </div>
  );
}
