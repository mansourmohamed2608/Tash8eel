"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { merchantApi } from "@/lib/client";

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
      cashier: boolean;
    };
    billing?: {
      cashierPromoEligible: boolean;
      cashierPromoActive: boolean;
      cashierPromoStartsAt: string | null;
      cashierPromoEndsAt: string | null;
      cashierEffective: boolean;
    };
  } | null;
  refetch: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType>({
  merchantId: "",
  apiKey: "",
  userId: "",
  isLoading: true,
  isDemo: false,
  merchant: null,
  refetch: async () => {},
});

export function MerchantProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [merchant, setMerchant] =
    useState<MerchantContextType["merchant"]>(null);

  // Use session credentials only.
  const merchantId = (session?.user as any)?.merchantId || "";
  const userId = (session?.user as any)?.id || "";
  const accessToken = (session as any)?.accessToken;
  const apiKey = accessToken || "";
  const isDemo = false;

  const fetchMerchantContext = async () => {
    setIsLoading(true);
    if (!apiKey) {
      setMerchant(null);
      setIsLoading(false);
      return;
    }
    try {
      const data = await merchantApi.getMe(apiKey);
      setMerchant(data);
    } catch (error) {
      console.warn("Failed to fetch merchant context:", error);
      setMerchant(null);
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
  adminKey: "",
  isLoading: false,
});

export function AdminProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const adminKey = (session as any)?.adminKey || "";

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
