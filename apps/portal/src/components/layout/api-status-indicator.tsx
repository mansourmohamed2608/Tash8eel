"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkApiHealth, getConnectionStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ApiStatusIndicator() {
  const [status, setStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");
  const [message, setMessage] = useState<string>("جاري التحقق من الاتصال...");
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const result = await checkApiHealth();
      setStatus(result.healthy ? "connected" : "disconnected");
      setMessage(result.healthy ? "متصل بالخادم" : result.message);
      setLastCheck(new Date());
    } catch (error) {
      setStatus("disconnected");
      setMessage("فشل الاتصال بالخادم");
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkConnection();

    // Check every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    checking: "text-yellow-500",
    connected: "text-green-500",
    disconnected: "text-red-500",
  };

  const bgColors = {
    checking: "bg-yellow-500/10",
    connected: "bg-green-500/10",
    disconnected: "bg-red-500/10",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2 gap-1.5 text-xs font-medium",
              bgColors[status],
            )}
            onClick={checkConnection}
            disabled={isChecking}
          >
            {isChecking ? (
              <RefreshCw
                className={cn("h-3.5 w-3.5 animate-spin", statusColors[status])}
              />
            ) : status === "connected" ? (
              <Wifi className={cn("h-3.5 w-3.5", statusColors[status])} />
            ) : (
              <WifiOff className={cn("h-3.5 w-3.5", statusColors[status])} />
            )}
            <span className={cn("hidden sm:inline", statusColors[status])}>
              {status === "connected"
                ? "متصل"
                : status === "disconnected"
                  ? "غير متصل"
                  : "جاري..."}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="text-right">
          <div className="space-y-1">
            <p className="font-medium">{message}</p>
            {lastCheck && (
              <p className="text-xs text-muted-foreground">
                آخر فحص: {lastCheck.toLocaleTimeString("ar-EG")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">انقر لإعادة الفحص</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
