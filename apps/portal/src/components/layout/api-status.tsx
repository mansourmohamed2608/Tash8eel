"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { checkApiHealth } from "@/lib/client";

interface ApiStatusIndicatorProps {
  collapsed?: boolean;
}

export function ApiStatusIndicator({ collapsed }: ApiStatusIndicatorProps) {
  const [status, setStatus] = useState<
    "connected" | "disconnected" | "checking"
  >("checking");
  const [message, setMessage] = useState<string>("جاري التحقق...");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const result = await checkApiHealth();
      setStatus(result.healthy ? "connected" : "disconnected");
      setMessage(result.healthy ? "متصل بالخادم" : result.message);
    } catch {
      setStatus("disconnected");
      setMessage("فشل الاتصال بالخادم");
    } finally {
      setLastChecked(new Date());
      setIsChecking(false);
    }
  }, [isChecking]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: "text-[var(--accent-success)]",
      bgColor: "bg-[var(--success-muted)]",
      label: "متصل",
    },
    disconnected: {
      icon: WifiOff,
      color: "text-[var(--accent-danger)]",
      bgColor: "bg-[var(--danger-muted)]",
      label: "غير متصل",
    },
    checking: {
      icon: RefreshCw,
      color: "text-[var(--accent-warning)]",
      bgColor: "bg-[var(--warning-muted)]",
      label: "جاري الفحص...",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={checkStatus}
              disabled={isChecking}
              className={cn(
                "p-2 rounded-md transition-colors hover:opacity-80",
                config.bgColor,
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  config.color,
                  isChecking && "animate-spin",
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <div className="text-right">
              <p className="font-medium">{config.label}</p>
              <p className="text-xs text-muted-foreground">{message}</p>
              {lastChecked && (
                <p className="text-xs text-muted-foreground mt-1">
                  آخر فحص: {lastChecked.toLocaleTimeString("ar-EG")}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      onClick={checkStatus}
      disabled={isChecking}
      className="flex items-center gap-2 text-sm w-full hover:opacity-80 transition-opacity"
    >
      <div className={cn("p-1.5 rounded-md", config.bgColor)}>
        <Icon
          className={cn("h-4 w-4", config.color, isChecking && "animate-spin")}
        />
      </div>
      <div className="text-right">
        <p className={cn("font-medium", config.color)}>{config.label}</p>
        {lastChecked && (
          <p className="text-xs text-muted-foreground">
            آخر فحص: {lastChecked.toLocaleTimeString("ar-EG")}
          </p>
        )}
      </div>
    </button>
  );
}
