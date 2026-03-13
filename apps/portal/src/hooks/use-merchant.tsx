"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { merchantApi } from "@/lib/api";

// Demo credentials - these should match what's in the database
// In production, get from session
export const DEMO_MERCHANT_ID = "demo-merchant";
export const DEMO_API_KEY =
  "mkey_demo_1234567890abcdef1234567890abcdef12345678";
export const DEMO_ADMIN_KEY = "admin_secret_key_12345";

interface MerchantContextType {
  merchantId: string;
  apiKey: string;
  userId: string;
  isLoading: boolean;
  isDemo: boolean;
  merchant: {
    id: string;
    name: string;
    category: string;
    enabledAgents: string[];
    enabledFeatures?: string[];
    plan: string;
    features: {
      inventory: boolean;
      reports: boolean;
      conversations: boolean;
      analytics: boolean;
      webhooks: boolean;
      team: boolean;
      audit: boolean;
      payments: boolean;
      vision: boolean;
      kpis: boolean;
      loyalty: boolean;
      voiceNotes: boolean;
      notifications: boolean;
      apiAccess: boolean;
    };
  } | null;
  refetch: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType>({
  merchantId: DEMO_MERCHANT_ID,
  apiKey: DEMO_API_KEY,
  userId: "demo-user",
  isLoading: true,
  isDemo: true,
  merchant: null,
  refetch: async () => {},
});

export function MerchantProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [merchant, setMerchant] =
    useState<MerchantContextType["merchant"]>(null);

  // Use session credentials or fall back to demo
  const merchantId = (session?.user as any)?.merchantId || DEMO_MERCHANT_ID;
  const userId = (session?.user as any)?.id || "demo-user";
  // For auth, we use the accessToken from session if available, otherwise fall back to demo API key
  // The accessToken is a JWT/demo token that the API guard will handle
  const accessToken = (session as any)?.accessToken;
  const apiKey = accessToken || DEMO_API_KEY;
  const isDemo = !session || !accessToken || merchantId === DEMO_MERCHANT_ID;

  const fetchMerchantContext = async () => {
    setIsLoading(true);
    try {
      const data = await merchantApi.getMe(apiKey);
      setMerchant(data);
    } catch (error) {
      console.warn("Failed to fetch merchant context, using defaults:", error);
      setMerchant((prev) => {
        if (prev) return prev;

        if (merchantId === DEMO_MERCHANT_ID) {
          return {
            id: merchantId,
            name: "وضع تجريبي",
            category: "GENERAL",
            enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
            enabledFeatures: [
              "CONVERSATIONS",
              "ORDERS",
              "CATALOG",
              "INVENTORY",
              "REPORTS",
              "KPI_DASHBOARD",
              "PAYMENTS",
              "WEBHOOKS",
              "TEAM",
              "AUDIT_LOGS",
              "NOTIFICATIONS",
              "API_ACCESS",
            ],
            plan: "pro",
            features: {
              inventory: true,
              reports: true,
              conversations: true,
              analytics: true,
              webhooks: true,
              team: true,
              audit: true,
              payments: true,
              vision: false,
              kpis: true,
              loyalty: false,
              voiceNotes: true,
              notifications: true,
              apiAccess: true,
            },
          };
        }

        return {
          id: merchantId,
          name: "المتجر",
          category: "GENERAL",
          enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT"],
          enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG", "INVENTORY"],
          plan: "starter",
          features: {
            inventory: true,
            reports: false,
            conversations: true,
            analytics: false,
            webhooks: false,
            team: false,
            audit: false,
            payments: false,
            vision: false,
            kpis: false,
            loyalty: false,
            voiceNotes: false,
            notifications: false,
            apiAccess: false,
          },
        };
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "loading") {
      fetchMerchantContext();
    }
  }, [status, apiKey, merchantId]);

  return (
    <MerchantContext.Provider
      value={{
        merchantId,
        apiKey,
        userId,
        isLoading: status === "loading" || isLoading,
        isDemo,
        merchant,
        refetch: fetchMerchantContext,
      }}
    >
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (!context) {
    throw new Error("useMerchant must be used within a MerchantProvider");
  }
  return context;
}

// Admin context
interface AdminContextType {
  adminKey: string;
  isLoading: boolean;
}

const AdminContext = createContext<AdminContextType>({
  adminKey: DEMO_ADMIN_KEY,
  isLoading: false,
});

export function AdminProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  // Use session admin key or fall back to demo
  const adminKey = (session as any)?.adminKey || DEMO_ADMIN_KEY;

  return (
    <AdminContext.Provider
      value={{
        adminKey,
        isLoading: status === "loading",
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
