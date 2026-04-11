"use client";

import { useEffect, useMemo, useState } from "react";
import { intelligenceMessages } from "@/lib/constants/mockData";

export function useIntelligenceBanner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % intelligenceMessages.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, []);

  return useMemo(
    () => ({
      currentMessage: intelligenceMessages[index],
      index,
      total: intelligenceMessages.length,
    }),
    [index],
  );
}
