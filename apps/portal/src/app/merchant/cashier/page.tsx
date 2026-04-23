"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Banknote,
  ClipboardList,
  CheckCircle2,
  CreditCard,
  DoorOpen,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingCart,
  Sparkles,
  Square,
  Store,
  Table2,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, branchesApi, merchantApi } from "@/lib/client";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DeliveryType = "delivery" | "pickup" | "dine_in";
type PaymentMethod = "cash" | "card" | "transfer";

interface PosSettings {
  enabled: boolean;
  mode: "retail" | "restaurant" | "hybrid";
  tablesEnabled: boolean;
  suspendedSalesEnabled: boolean;
  splitPaymentsEnabled: boolean;
  returnsEnabled: boolean;
  requireActiveRegisterSession: boolean;
  defaultServiceMode: DeliveryType;
  thermalReceiptWidth: "58mm" | "80mm" | "a4";
}

interface CatalogProduct {
  id: string;
  name: string;
  unitPrice: number;
  category: string;
  sku?: string;
  imageUrl?: string;
  isAvailable: boolean;
}

interface CartItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface CreatedOrderSummary {
  id?: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: string;
  deliveryType: DeliveryType;
  status?: string;
  branchName?: string;
  registerSessionId?: string;
  shiftId?: string;
  refundsAmount?: number;
  address?: string;
  subtotal: number;
  discount: number;
  taxTotal?: number;
  total: number;
  notes?: string;
  items: CartItem[];
}

interface CustomerLookupResult {
  customerId: string;
  name: string;
  phone: string;
  loyaltyTier?: string | null;
  loyaltyPoints: number;
  segment?: string;
}

interface BranchOption {
  id: string;
  name: string;
  city?: string;
}

interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

interface PosDraft {
  id: string;
  branchId?: string | null;
  shiftId?: string | null;
  registerSessionId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  serviceMode: DeliveryType;
  tableId?: string | null;
  items: CartItem[];
  discount: number;
  notes?: string;
  paymentMethod?: string | null;
  payments: PaymentEntry[];
  subtotal: number;
  taxTotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  metadata?: { deliveryAddress?: string | null };
  createdAt?: string;
  updatedAt?: string;
}

interface PosTable {
  id: string;
  branchId: string;
  name: string;
  area?: string | null;
  capacity?: number | null;
  status: string;
  sortOrder: number;
  currentDraftId?: string | null;
  currentDraft?: {
    id: string;
    customerName?: string;
    total: number;
    status?: string;
  } | null;
}

interface RegisterSession {
  id: string;
  branchId: string;
  shiftId?: string | null;
  openingFloat: number;
  expectedCash?: number;
  totalOrders?: number;
  status: string;
  openedAt?: string;
}

interface RegisterSummary {
  register: RegisterSession | null;
  payments: Array<{ method: string; amount: number }>;
  totals: {
    totalOrders: number;
    paidAmount: number;
    cashAmount: number;
    cardAmount: number;
    transferAmount: number;
    refundsAmount: number;
    expectedCash: number;
  };
}

interface CashierCopilotSuggestion {
  id: string;
  type: "alert" | "insight" | "action";
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  action?: {
    kind: string;
    label: string;
    payload?: Record<string, unknown>;
    requiresApproval?: boolean;
  };
}

interface CashierCopilotApprovalRecord {
  actionId: string;
  intent: string;
  status: string;
  previewSummary: string | null;
  expiresAt: string | null;
  riskTier: "low" | "medium" | "high" | "critical";
}

interface CashierCopilotResponse {
  generatedAt: string;
  contextDigest: {
    todayCashierOrders: number;
    todayCashierRevenue: number;
    pendingApprovals: number;
    openRegisters: number;
    activeDrafts: number;
    forecastRisks: {
      lowConfidencePredictions: number;
      staleRuns: number;
      highUrgencyReplenishments: number;
    };
  };
  suggestions: CashierCopilotSuggestion[];
}

const DELIVERY_OPTIONS: Array<{
  key: DeliveryType;
  label: string;
  icon: typeof Truck;
}> = [
  { key: "delivery", label: "توصيل", icon: Truck },
  { key: "pickup", label: "استلام", icon: Package },
  { key: "dine_in", label: "داخل الفرع", icon: ShoppingCart },
];

const PAYMENT_OPTIONS: Array<{
  key: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { key: "cash", label: "نقدي", icon: Banknote },
  { key: "card", label: "بطاقة", icon: CreditCard },
  { key: "transfer", label: "تحويل", icon: RefreshCw },
];

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeLookup = (value: string) => value.trim().toLowerCase();
const DEFAULT_POS_SETTINGS: PosSettings = {
  enabled: true,
  mode: "retail",
  tablesEnabled: false,
  suspendedSalesEnabled: true,
  splitPaymentsEnabled: true,
  returnsEnabled: true,
  requireActiveRegisterSession: false,
  defaultServiceMode: "pickup",
  thermalReceiptWidth: "80mm",
};

export default function CashierPage() {
  const { merchant, merchantId, apiKey } = useMerchant();
  const { toast } = useToast();
  const router = useRouter();

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState("0");
  const [taxInput, setTaxInput] = useState("0");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([
    { method: "cash", amount: 0 },
  ]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerResults, setCustomerResults] = useState<
    CustomerLookupResult[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerLookupResult | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [activeCartIndex, setActiveCartIndex] = useState(-1);
  const [lastCreatedOrder, setLastCreatedOrder] =
    useState<CreatedOrderSummary | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [currentShift, setCurrentShift] = useState<any | null>(null);
  const [posSettings, setPosSettings] =
    useState<PosSettings>(DEFAULT_POS_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [currentRegister, setCurrentRegister] =
    useState<RegisterSession | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [openShiftNotes, setOpenShiftNotes] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closeShiftNotes, setCloseShiftNotes] = useState("");
  const [registerSummary, setRegisterSummary] =
    useState<RegisterSummary | null>(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [recentOrdersLoading, setRecentOrdersLoading] = useState(false);
  const [recentOrders, setRecentOrders] = useState<CreatedOrderSummary[]>([]);
  const [posDrafts, setPosDrafts] = useState<PosDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [posTables, setPosTables] = useState<PosTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [createTableDialog, setCreateTableDialog] = useState(false);
  const [tableName, setTableName] = useState("");
  const [tableArea, setTableArea] = useState("");
  const [tableCapacity, setTableCapacity] = useState("4");
  const [creatingTable, setCreatingTable] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [partialRefundDialog, setPartialRefundDialog] = useState(false);
  const [refundRestock, setRefundRestock] = useState(true);
  const [refundCreateExchange, setRefundCreateExchange] = useState(false);
  const [refundItemQuantities, setRefundItemQuantities] = useState<
    Record<number, number>
  >({});
  const [tableActionDialog, setTableActionDialog] = useState<{
    type: "transfer" | "split" | "merge";
    table: PosTable;
  } | null>(null);
  const [tableActionTargetId, setTableActionTargetId] = useState("");
  const [splitSelections, setSplitSelections] = useState<
    Record<number, number>
  >({});
  const [tableActionLoading, setTableActionLoading] = useState(false);
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<
    PaymentEntry[]
  >([]);
  const [cashierCopilotLoading, setCashierCopilotLoading] = useState(false);
  const [cashierCopilotQuery, setCashierCopilotQuery] = useState("");
  const [cashierCopilotData, setCashierCopilotData] =
    useState<CashierCopilotResponse | null>(null);
  const [cashierCopilotApprovals, setCashierCopilotApprovals] = useState<
    CashierCopilotApprovalRecord[]
  >([]);
  const [cashierCopilotApprovalsLoading, setCashierCopilotApprovalsLoading] =
    useState(false);
  const [showCashierApprovalsPanel, setShowCashierApprovalsPanel] =
    useState(false);
  const [approvalActionLoadingId, setApprovalActionLoadingId] = useState<
    string | null
  >(null);

  const merchantName = merchant?.name || "الكاشير";

  const getSuggestionTone = useCallback(
    (priority: CashierCopilotSuggestion["priority"]) => {
      if (priority === "high") {
        return "border-red-200 bg-red-50 text-red-700";
      }
      if (priority === "medium") {
        return "border-amber-200 bg-amber-50 text-amber-800";
      }
      return "border-blue-200 bg-blue-50 text-blue-800";
    },
    [],
  );

  const mapOrderToReceiptSummary = useCallback(
    (order: any): CreatedOrderSummary => ({
      id: String(order?.id || "").trim() || undefined,
      orderNumber: String(order?.orderNumber || "---"),
      createdAt: String(order?.createdAt || new Date().toISOString()),
      customerName:
        String(order?.customerName || "عميل نقدي").trim() || "عميل نقدي",
      customerPhone: String(order?.customerPhone || "").trim(),
      paymentMethod: PAYMENT_OPTIONS.some(
        (option) => option.key === order?.paymentMethod,
      )
        ? order.paymentMethod
        : "cash",
      paymentStatus: String(order?.paymentStatus || "").trim() || undefined,
      deliveryType: DELIVERY_OPTIONS.some(
        (option) => option.key === order?.deliveryType,
      )
        ? order.deliveryType
        : "pickup",
      status: String(order?.status || "").trim() || undefined,
      branchName:
        String(order?.branchName || order?.branch?.name || "").trim() ||
        undefined,
      registerSessionId:
        String(order?.registerSessionId || "").trim() || undefined,
      shiftId: String(order?.shiftId || "").trim() || undefined,
      refundsAmount: Number(order?.refundsAmount ?? 0) || 0,
      address:
        typeof order?.deliveryAddress === "string"
          ? order.deliveryAddress
          : typeof order?.deliveryAddress?.raw_text === "string"
            ? order.deliveryAddress.raw_text
            : typeof order?.deliveryAddress?.street === "string"
              ? order.deliveryAddress.street
              : undefined,
      subtotal: Number(order?.subtotal ?? 0) || 0,
      discount: Number(order?.discount ?? 0) || 0,
      taxTotal: Number(order?.taxTotal ?? 0) || 0,
      total: Number(order?.total ?? 0) || 0,
      notes:
        String(order?.notes || order?.deliveryNotes || "").trim() || undefined,
      items: Array.isArray(order?.items)
        ? order.items.map((item: any) => ({
            catalogItemId:
              String(item?.catalogItemId || "").trim() || undefined,
            name: String(item?.name || "منتج").trim() || "منتج",
            quantity: Number(item?.quantity ?? 0) || 0,
            unitPrice: Number(item?.unitPrice ?? 0) || 0,
            notes: String(item?.notes || "").trim() || undefined,
          }))
        : [],
    }),
    [],
  );

  const loadPosSettings = useCallback(async () => {
    if (!apiKey) return;
    setSettingsLoading(true);
    try {
      const response = await merchantApi.getSettings(apiKey);
      const nextSettings = {
        ...DEFAULT_POS_SETTINGS,
        ...(response?.pos || {}),
      } as PosSettings;
      setPosSettings(nextSettings);
      setDeliveryType((current) =>
        current ? current : nextSettings.defaultServiceMode,
      );
    } catch {
      setPosSettings(DEFAULT_POS_SETTINGS);
    } finally {
      setSettingsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadPosSettings();
  }, [loadPosSettings]);

  const loadCatalog = useCallback(async () => {
    if (!apiKey) {
      setCatalogItems([]);
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    try {
      const response = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
        1,
        600,
      );
      const mapped: CatalogProduct[] = (response.items || [])
        .map((item: any) => {
          const name =
            String(
              item?.name_ar ||
                item?.nameAr ||
                item?.name ||
                item?.title ||
                item?.sku ||
                "",
            ).trim() || "منتج";
          const category =
            String(item?.category || "بدون تصنيف").trim() || "بدون تصنيف";
          const unitPrice = Number(
            item?.base_price ?? item?.price ?? item?.unit_price ?? 0,
          );

          return {
            id: String(item?.id || "").trim(),
            name,
            sku: String(item?.sku || "").trim() || undefined,
            category,
            imageUrl: String(item?.image_url || "").trim() || undefined,
            unitPrice: Number.isFinite(unitPrice) ? round2(unitPrice) : 0,
            isAvailable:
              item?.is_available !== false && item?.isActive !== false,
          };
        })
        .filter(
          (item: CatalogProduct) => item.id.length > 0 && item.isAvailable,
        );

      setCatalogItems(mapped);
    } catch (error) {
      toast({
        title: "تعذر تحميل الكتالوج",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [apiKey, merchantId, toast]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!merchantId || typeof window === "undefined") return;
    const savedBranchId = window.localStorage.getItem(
      `cashier:selected-branch:${merchantId}`,
    );
    if (savedBranchId) {
      setSelectedBranchId(savedBranchId);
    }
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId || typeof window === "undefined") return;
    if (selectedBranchId) {
      window.localStorage.setItem(
        `cashier:selected-branch:${merchantId}`,
        selectedBranchId,
      );
    } else {
      window.localStorage.removeItem(`cashier:selected-branch:${merchantId}`);
    }
  }, [merchantId, selectedBranchId]);

  const loadBranches = useCallback(async () => {
    if (!apiKey) {
      setBranches([]);
      return;
    }

    setBranchesLoading(true);
    try {
      const response = await branchesApi.list(apiKey);
      const mapped: BranchOption[] = Array.isArray(response?.branches)
        ? response.branches
            .map((branch: any) => ({
              id: String(branch?.id || "").trim(),
              name: String(branch?.name || "فرع").trim() || "فرع",
              city: String(branch?.city || "").trim() || undefined,
            }))
            .filter((branch) => branch.id)
        : [];
      setBranches(mapped);
      if (!selectedBranchId && mapped.length > 0) {
        setSelectedBranchId(mapped[0].id);
      }
    } catch {
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  }, [apiKey, selectedBranchId]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const loadCurrentShift = useCallback(async () => {
    if (!apiKey || !selectedBranchId) {
      setCurrentShift(null);
      setShiftLoading(false);
      return;
    }

    setShiftLoading(true);
    try {
      const response = await branchesApi.getCurrentShift(
        apiKey,
        selectedBranchId,
      );
      setCurrentShift(response?.data ?? null);
    } catch {
      setCurrentShift(null);
    } finally {
      setShiftLoading(false);
    }
  }, [apiKey, selectedBranchId]);

  useEffect(() => {
    void loadCurrentShift();
  }, [loadCurrentShift]);

  const loadCurrentRegister = useCallback(async () => {
    if (!apiKey || !selectedBranchId) {
      setCurrentRegister(null);
      setRegisterLoading(false);
      return;
    }

    setRegisterLoading(true);
    try {
      const response = await merchantApi.getCurrentPosRegister(
        apiKey,
        selectedBranchId,
      );
      setCurrentRegister(response?.data ?? null);
    } catch {
      setCurrentRegister(null);
    } finally {
      setRegisterLoading(false);
    }
  }, [apiKey, selectedBranchId]);

  useEffect(() => {
    void loadCurrentRegister();
  }, [loadCurrentRegister]);

  const loadRegisterSummary = useCallback(async () => {
    if (!apiKey || !currentRegister?.id) {
      setRegisterSummary(null);
      return;
    }
    try {
      const response = await merchantApi.getPosRegisterSummary(
        apiKey,
        currentRegister.id,
      );
      setRegisterSummary((response?.data ?? null) as RegisterSummary | null);
    } catch {
      setRegisterSummary(null);
    }
  }, [apiKey, currentRegister?.id]);

  useEffect(() => {
    if (!closeShiftDialog) return;
    void loadRegisterSummary();
  }, [closeShiftDialog, loadRegisterSummary]);

  const loadPosDrafts = useCallback(async () => {
    if (!apiKey || !posSettings.suspendedSalesEnabled) {
      setPosDrafts([]);
      setDraftsLoading(false);
      return;
    }

    setDraftsLoading(true);
    try {
      const response = await merchantApi.listPosDrafts(apiKey, {
        branchId: selectedBranchId || undefined,
      });
      setPosDrafts(Array.isArray(response?.drafts) ? response.drafts : []);
    } catch {
      setPosDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  }, [apiKey, posSettings.suspendedSalesEnabled, selectedBranchId]);

  useEffect(() => {
    void loadPosDrafts();
  }, [loadPosDrafts]);

  const loadPosTables = useCallback(async () => {
    if (!apiKey || !selectedBranchId || !posSettings.tablesEnabled) {
      setPosTables([]);
      setTablesLoading(false);
      return;
    }

    setTablesLoading(true);
    try {
      const response = await merchantApi.listPosTables(
        apiKey,
        selectedBranchId,
      );
      setPosTables(Array.isArray(response?.tables) ? response.tables : []);
    } catch {
      setPosTables([]);
    } finally {
      setTablesLoading(false);
    }
  }, [apiKey, posSettings.tablesEnabled, selectedBranchId]);

  useEffect(() => {
    void loadPosTables();
  }, [loadPosTables]);

  const loadRecentOrders = useCallback(async () => {
    if (!apiKey) {
      setRecentOrders([]);
      setRecentOrdersLoading(false);
      return;
    }

    setRecentOrdersLoading(true);
    try {
      const response = await merchantApi.getOrders(merchantId, apiKey, {
        source: "cashier",
        branchId: selectedBranchId || undefined,
        limit: 8,
      });
      const mapped = Array.isArray(response.orders)
        ? response.orders.map((order: any) => mapOrderToReceiptSummary(order))
        : [];
      setRecentOrders(mapped);
    } catch {
      setRecentOrders([]);
    } finally {
      setRecentOrdersLoading(false);
    }
  }, [apiKey, mapOrderToReceiptSummary, merchantId, selectedBranchId]);

  useEffect(() => {
    void loadRecentOrders();
  }, [loadRecentOrders]);

  const loadCashierCopilotSuggestions = useCallback(
    async (queryOverride?: string) => {
      if (!apiKey) {
        setCashierCopilotData(null);
        setCashierCopilotLoading(false);
        return;
      }

      setCashierCopilotLoading(true);
      try {
        const normalizedQuery = String(queryOverride || "").trim() || undefined;
        const response = await merchantApi.getCashierCopilotSuggestions(
          apiKey,
          {
            draftId: currentDraftId || undefined,
            branchId: selectedBranchId || undefined,
            query: normalizedQuery,
          },
        );

        setCashierCopilotData({
          generatedAt: String(
            response?.generatedAt || new Date().toISOString(),
          ),
          contextDigest: {
            todayCashierOrders: Number(
              response?.contextDigest?.todayCashierOrders || 0,
            ),
            todayCashierRevenue: Number(
              response?.contextDigest?.todayCashierRevenue || 0,
            ),
            pendingApprovals: Number(
              response?.contextDigest?.pendingApprovals || 0,
            ),
            openRegisters: Number(response?.contextDigest?.openRegisters || 0),
            activeDrafts: Number(response?.contextDigest?.activeDrafts || 0),
            forecastRisks: {
              lowConfidencePredictions: Number(
                response?.contextDigest?.forecastRisks
                  ?.lowConfidencePredictions || 0,
              ),
              staleRuns: Number(
                response?.contextDigest?.forecastRisks?.staleRuns || 0,
              ),
              highUrgencyReplenishments: Number(
                response?.contextDigest?.forecastRisks
                  ?.highUrgencyReplenishments || 0,
              ),
            },
          },
          suggestions: Array.isArray(response?.suggestions)
            ? (response.suggestions as CashierCopilotSuggestion[])
            : [],
        });
      } catch {
        setCashierCopilotData(null);
      } finally {
        setCashierCopilotLoading(false);
      }
    },
    [apiKey, currentDraftId, selectedBranchId],
  );

  useEffect(() => {
    void loadCashierCopilotSuggestions();
  }, [loadCashierCopilotSuggestions]);

  useEffect(() => {
    if (!cashierCopilotData) return;
    if (Number(cashierCopilotData.contextDigest.pendingApprovals || 0) > 0) {
      setShowCashierApprovalsPanel(true);
    }
  }, [cashierCopilotData]);

  const loadCashierCopilotApprovals = useCallback(
    async (status = "pending") => {
      if (!apiKey) {
        setCashierCopilotApprovals([]);
        setCashierCopilotApprovalsLoading(false);
        return;
      }

      setCashierCopilotApprovalsLoading(true);
      try {
        const response = await merchantApi.copilotApprovals(apiKey, {
          status,
          limit: 8,
          offset: 0,
        });
        setCashierCopilotApprovals(
          Array.isArray(response?.approvals)
            ? response.approvals.map((row) => ({
                actionId: String(row?.actionId || ""),
                intent: String(row?.intent || "UNKNOWN"),
                status: String(row?.status || "pending"),
                previewSummary:
                  String(row?.previewSummary || "").trim() || null,
                expiresAt:
                  String(row?.expiresAt || "").trim() || row?.expiresAt || null,
                riskTier: row?.riskTier || "low",
              }))
            : [],
        );
      } catch {
        setCashierCopilotApprovals([]);
      } finally {
        setCashierCopilotApprovalsLoading(false);
      }
    },
    [apiKey],
  );

  useEffect(() => {
    if (!showCashierApprovalsPanel) return;
    void loadCashierCopilotApprovals("pending");
  }, [showCashierApprovalsPanel, loadCashierCopilotApprovals]);

  const confirmCashierCopilotApproval = useCallback(
    async (actionId: string, confirm: boolean) => {
      if (!apiKey || !actionId) return;
      setApprovalActionLoadingId(actionId);
      try {
        const response = await merchantApi.copilotConfirm(
          apiKey,
          actionId,
          confirm,
        );
        if (response?.success) {
          toast({
            title: confirm ? "تم اعتماد الإجراء" : "تم رفض الإجراء",
          });
        } else {
          toast({
            title: "تعذر تحديث الإجراء",
            description:
              String(response?.reply || "").trim() || "يرجى المحاولة مرة أخرى",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "تعذر تحديث الإجراء",
          description:
            error instanceof Error ? error.message : "حدث خطأ غير متوقع",
          variant: "destructive",
        });
      } finally {
        setApprovalActionLoadingId(null);
        await Promise.all([
          loadCashierCopilotSuggestions(),
          loadCashierCopilotApprovals("pending"),
        ]);
      }
    },
    [apiKey, loadCashierCopilotApprovals, loadCashierCopilotSuggestions, toast],
  );

  const handleCashierSuggestionAction = useCallback(
    async (suggestion: CashierCopilotSuggestion) => {
      const action = suggestion.action;
      if (!action?.kind) return;

      if (action.kind === "review_approvals" || action.requiresApproval) {
        setShowCashierApprovalsPanel(true);
        await loadCashierCopilotApprovals(
          String(action.payload?.status || "pending"),
        );
        return;
      }

      if (action.kind === "open_register") {
        setOpenShiftDialog(true);
        return;
      }

      if (action.kind === "open_replenishment") {
        router.push("/merchant/forecast");
        return;
      }

      if (action.kind === "open_inventory_item") {
        const catalogItemId = String(
          action.payload?.catalogItemId || "",
        ).trim();
        const search = catalogItemId
          ? `?item=${encodeURIComponent(catalogItemId)}`
          : "";
        router.push(`/merchant/inventory${search}`);
        return;
      }

      if (action.kind === "open_forecast") {
        router.push("/merchant/forecast");
        return;
      }

      if (action.kind === "open_discount_report") {
        router.push("/merchant/reports/discount-impact");
        return;
      }

      if (action.kind === "review_cart_items") {
        setProductSearch("");
        toast({
          title: "تم تفعيل مراجعة السلة",
          description: "راجع الكميات والأسعار قبل إتمام الإغلاق.",
        });
        return;
      }

      if (action.kind === "review_payment_split") {
        setPaymentEntries((current) => {
          if (Array.isArray(current) && current.length > 0) {
            return current;
          }
          return [{ method: paymentMethod, amount: 0 }];
        });
        toast({
          title: "راجع توزيع التحصيل",
          description:
            "تأكد من مطابقة مجموع طرق الدفع مع إجمالي الطلب قبل الإغلاق.",
        });
        return;
      }

      setCashierCopilotQuery(suggestion.title);
      await loadCashierCopilotSuggestions(suggestion.title);
    },
    [
      loadCashierCopilotApprovals,
      loadCashierCopilotSuggestions,
      paymentMethod,
      router,
      toast,
    ],
  );

  const handleOpenShift = useCallback(async () => {
    if (!apiKey || !selectedBranchId) return;
    setOpeningShift(true);
    try {
      await merchantApi.openPosRegister(apiKey, {
        branchId: selectedBranchId,
        shiftId: String(currentShift?.id || "").trim() || undefined,
        openingFloat: Number(openingCash) || 0,
        notes: openShiftNotes.trim() || undefined,
      });
      toast({ title: "تم فتح جلسة الكاشير" });
      setOpenShiftDialog(false);
      setOpeningCash("0");
      setOpenShiftNotes("");
      await Promise.all([loadCurrentShift(), loadCurrentRegister()]);
    } catch (error) {
      toast({
        title: "فشل فتح الجلسة",
        description:
          error instanceof Error ? error.message : "تعذر فتح الجلسة حالياً",
        variant: "destructive",
      });
    } finally {
      setOpeningShift(false);
    }
  }, [
    apiKey,
    currentShift?.id,
    loadCurrentRegister,
    loadCurrentShift,
    openShiftNotes,
    openingCash,
    selectedBranchId,
    toast,
  ]);

  const handleCloseShift = useCallback(async () => {
    if (!apiKey || !selectedBranchId || !currentRegister?.id) return;
    setClosingShift(true);
    try {
      await merchantApi.closePosRegister(apiKey, currentRegister.id, {
        countedCash: closingCash.trim() ? Number(closingCash) : undefined,
        notes: closeShiftNotes.trim() || undefined,
      });
      toast({ title: "تم إغلاق جلسة الكاشير" });
      setCloseShiftDialog(false);
      setClosingCash("");
      setCloseShiftNotes("");
      await Promise.all([loadCurrentShift(), loadCurrentRegister()]);
    } catch (error) {
      toast({
        title: "فشل إغلاق الجلسة",
        description:
          error instanceof Error ? error.message : "تعذر إغلاق الجلسة حالياً",
        variant: "destructive",
      });
    } finally {
      setClosingShift(false);
    }
  }, [
    apiKey,
    closeShiftNotes,
    closingCash,
    currentRegister?.id,
    loadCurrentRegister,
    loadCurrentShift,
    selectedBranchId,
    toast,
  ]);

  const applySelectedCustomer = useCallback(
    (customer: CustomerLookupResult) => {
      setSelectedCustomer(customer);
      setCustomerSearch(customer.name || customer.phone);
      setCustomerName(customer.name || "");
      setCustomerPhone(customer.phone || "");
      setCustomerResults([]);
    },
    [],
  );

  useEffect(() => {
    if (!apiKey) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return;
    }

    const query = customerSearch.trim();
    if (query.length < 2) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const params = new URLSearchParams({
          search: query,
          limit: "8",
        });
        const response = await apiFetch<any>(`/v1/portal/customers?${params}`, {
          apiKey,
        });
        const mapped: CustomerLookupResult[] = (response.customers || []).map(
          (customer: any) => ({
            customerId: String(customer.id || customer.customerId || "").trim(),
            name: String(customer.name || "عميل").trim() || "عميل",
            phone: String(customer.phone || "").trim(),
            loyaltyTier: customer.loyaltyTier || null,
            loyaltyPoints: Number(customer.loyaltyPoints ?? 0) || 0,
            segment: String(customer.segment || "").trim() || undefined,
          }),
        );
        setCustomerResults(mapped.filter((customer) => customer.customerId));
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [apiKey, customerSearch]);

  useEffect(() => {
    if (!selectedCustomer) return;

    const matchesSelectedName =
      customerName.trim().length === 0 ||
      customerName.trim() === selectedCustomer.name;
    const matchesSelectedPhone =
      customerPhone.trim().length === 0 ||
      customerPhone.trim() === selectedCustomer.phone;

    if (!matchesSelectedName || !matchesSelectedPhone) {
      setSelectedCustomer(null);
    }
  }, [customerName, customerPhone, selectedCustomer]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((item) => {
      set.add(item.category || "بدون تصنيف");
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "ar"))];
  }, [catalogItems]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return catalogItems.filter((item) => {
      const matchesCategory =
        activeCategory === "all" || item.category === activeCategory;
      const matchesQuery =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        String(item.sku || "")
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [catalogItems, productSearch, activeCategory]);

  const subtotal = useMemo(
    () =>
      round2(
        cartItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0,
        ),
      ),
    [cartItems],
  );

  const discount = useMemo(() => {
    const parsed = Number(discountInput);
    if (!Number.isFinite(parsed)) return 0;
    return round2(Math.max(0, Math.min(parsed, subtotal)));
  }, [discountInput, subtotal]);

  const taxTotal = useMemo(() => {
    const parsed = Number(taxInput);
    if (!Number.isFinite(parsed)) return 0;
    return round2(Math.max(0, parsed));
  }, [taxInput]);

  const totalAfterDiscount = useMemo(
    () => round2(Math.max(0, subtotal - discount + taxTotal)),
    [subtotal, discount, taxTotal],
  );

  const totalPaid = useMemo(
    () =>
      round2(
        paymentEntries.reduce(
          (sum, entry) =>
            sum + (Number.isFinite(entry.amount) ? entry.amount : 0),
          0,
        ),
      ),
    [paymentEntries],
  );

  const remainingBalance = useMemo(
    () => round2(Math.max(0, totalAfterDiscount - totalPaid)),
    [totalAfterDiscount, totalPaid],
  );

  const cartItemsCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.quantity), 0),
    [cartItems],
  );

  useEffect(() => {
    setPaymentEntries((prev) => {
      if (!posSettings.splitPaymentsEnabled) {
        return [{ method: paymentMethod, amount: totalAfterDiscount }];
      }
      if (prev.length === 0) {
        return [{ method: paymentMethod, amount: totalAfterDiscount }];
      }
      if (prev.length === 1) {
        return [
          { ...prev[0], method: paymentMethod, amount: totalAfterDiscount },
        ];
      }
      return prev;
    });
  }, [paymentMethod, posSettings.splitPaymentsEnabled, totalAfterDiscount]);

  const hydrateDraftIntoForm = useCallback(
    (draft: PosDraft) => {
      setCurrentDraftId(draft.id);
      setCartItems(
        Array.isArray(draft.items)
          ? draft.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              name: item.name,
              quantity: Number(item.quantity) || 0,
              unitPrice: Number(item.unitPrice) || 0,
              notes: item.notes,
            }))
          : [],
      );
      setDiscountInput(String(Number(draft.discount || 0)));
      setTaxInput(String(Number(draft.taxTotal || 0)));
      setDeliveryType(draft.serviceMode || posSettings.defaultServiceMode);
      setDeliveryAddress(String(draft.metadata?.deliveryAddress || ""));
      setPaymentMethod((draft.paymentMethod as PaymentMethod | null) || "cash");
      setPaymentEntries(
        Array.isArray(draft.payments) && draft.payments.length > 0
          ? draft.payments.map((entry) => ({
              method: (entry.method as PaymentMethod) || "cash",
              amount: Number(entry.amount || 0),
              reference: entry.reference,
            }))
          : [
              {
                method: ((draft.paymentMethod as PaymentMethod | null) ||
                  "cash") as PaymentMethod,
                amount: Number(draft.total || 0),
              },
            ],
      );
      setSelectedCustomer(
        draft.customerId
          ? {
              customerId: draft.customerId,
              name: draft.customerName || "عميل",
              phone: draft.customerPhone || "",
              loyaltyPoints: 0,
            }
          : null,
      );
      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      setCustomerSearch(draft.customerName || draft.customerPhone || "");
      setNotes(draft.notes || "");
      setSelectedTableId(draft.tableId || null);
      setLastCreatedOrder(null);
    },
    [posSettings.defaultServiceMode],
  );

  const addToCart = useCallback((product: CatalogProduct) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.catalogItemId === product.id,
      );
      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          catalogItemId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.unitPrice,
        },
      ];
    });
  }, []);

  const handleBarcodeAdd = useCallback(async () => {
    const lookup = barcodeInput.trim();
    if (!lookup || !apiKey) return;

    setBarcodeLoading(true);
    try {
      const result = await merchantApi.findByBarcode(
        merchantId,
        apiKey,
        lookup,
      );
      if (!result?.found) {
        toast({
          title: "لم يتم العثور على منتج",
          description: "الباركود أو الكود غير موجود في المخزون الحالي",
          variant: "destructive",
        });
        return;
      }

      const payload = result.data || {};
      const candidateCatalogId = String(
        payload.catalog_item_id || payload.catalogItemId || "",
      ).trim();
      const candidateSku = String(
        payload.item_sku || payload.sku || payload.variant_sku || "",
      ).trim();
      const candidateName = String(
        payload.item_name || payload.name || payload.product_name || "",
      ).trim();

      const matchedProduct =
        catalogItems.find((item) => item.id === candidateCatalogId) ||
        catalogItems.find(
          (item) =>
            candidateSku.length > 0 &&
            normalizeLookup(String(item.sku || "")) ===
              normalizeLookup(candidateSku),
        ) ||
        catalogItems.find(
          (item) =>
            candidateName.length > 0 &&
            normalizeLookup(item.name) === normalizeLookup(candidateName),
        );

      if (!matchedProduct) {
        toast({
          title: "تم العثور على العنصر في المخزون فقط",
          description:
            "العنصر موجود لكن لم أستطع مطابقته مع كتالوج البيع في شاشة الكاشير",
          variant: "destructive",
        });
        return;
      }

      addToCart(matchedProduct);
      setBarcodeInput("");
      toast({
        title: "تمت إضافة المنتج",
        description: matchedProduct.name,
      });
    } catch (error) {
      toast({
        title: "تعذر قراءة الباركود",
        description:
          error instanceof Error ? error.message : "حدث خطأ أثناء البحث بالكود",
        variant: "destructive",
      });
    } finally {
      setBarcodeLoading(false);
    }
  }, [apiKey, barcodeInput, catalogItems, merchantId, toast, addToCart]);

  const updateCartItem = useCallback(
    (
      index: number,
      patch: Partial<Pick<CartItem, "quantity" | "unitPrice" | "notes">>,
    ) => {
      setCartItems((prev) =>
        prev
          .map((item, itemIndex) => {
            if (itemIndex !== index) return item;

            const nextQuantity =
              patch.quantity !== undefined
                ? Math.max(0, Number(patch.quantity) || 0)
                : Number(item.quantity);
            const nextPrice =
              patch.unitPrice !== undefined
                ? Math.max(0, Number(patch.unitPrice) || 0)
                : Number(item.unitPrice);

            return {
              ...item,
              ...patch,
              quantity: nextQuantity,
              unitPrice: round2(nextPrice),
            };
          })
          .filter((item) => item.quantity > 0),
      );
    },
    [],
  );

  const removeCartItem = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  useEffect(() => {
    setActiveCartIndex((previous) => {
      if (cartItems.length === 0) return -1;
      if (previous < 0 || previous >= cartItems.length)
        return cartItems.length - 1;
      return previous;
    });
  }, [cartItems.length]);

  const clearOrderDraft = useCallback(() => {
    setCartItems([]);
    setDiscountInput("0");
    setTaxInput("0");
    setDeliveryType(posSettings.defaultServiceMode);
    setDeliveryAddress("");
    setPaymentMethod("cash");
    setPaymentEntries([{ method: "cash", amount: 0 }]);
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setCurrentDraftId(null);
    setSelectedTableId(null);
    setSelectedOrderPayments([]);
  }, [posSettings.defaultServiceMode]);

  const startNewOrder = useCallback(() => {
    setLastCreatedOrder(null);
    clearOrderDraft();
  }, [clearOrderDraft]);

  const printReceipt = useCallback(() => {
    if (!lastCreatedOrder) {
      toast({
        title: "لا يوجد إيصال للطباعة",
        description: "نفذ طلباً أولاً ثم اطبع الإيصال",
      });
      return;
    }
    const branchName =
      branches.find((branch) => branch.id === selectedBranchId)?.name ||
      "الفرع الرئيسي";
    const receiptWidth =
      posSettings.thermalReceiptWidth === "58mm"
        ? "58mm"
        : posSettings.thermalReceiptWidth === "a4"
          ? "210mm"
          : "80mm";
    const paymentLines =
      selectedOrderPayments.length > 0
        ? selectedOrderPayments
        : [
            {
              method: lastCreatedOrder.paymentMethod,
              amount: lastCreatedOrder.total,
            },
          ];
    const paymentLabel = (method: PaymentMethod) =>
      PAYMENT_OPTIONS.find((option) => option.key === method)?.label || method;
    const opened = window.open("", "_blank", "width=720,height=900");
    if (!opened) {
      toast({
        title: "تعذر فتح نافذة الطباعة",
        description: "اسمح للنوافذ المنبثقة ثم حاول مرة أخرى",
        variant: "destructive",
      });
      return;
    }
    const itemsHtml = lastCreatedOrder.items
      .map(
        (item) => `
          <div class="row">
            <span>${item.name} × ${item.quantity}</span>
            <span>${formatCurrency(item.quantity * item.unitPrice)}</span>
          </div>`,
      )
      .join("");
    const paymentsHtml = paymentLines
      .map(
        (entry) => `
          <div class="row">
            <span>${paymentLabel(entry.method)}</span>
            <span>${formatCurrency(entry.amount)}</span>
          </div>`,
      )
      .join("");
    opened.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>Receipt ${lastCreatedOrder.orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; background:#fff; color:#111; margin:0; }
            .receipt { width:${receiptWidth}; margin:0 auto; padding:12px; }
            .center { text-align:center; }
            .section { border-bottom:1px dashed #999; padding:8px 0; margin-bottom:8px; }
            .row { display:flex; justify-content:space-between; gap:12px; margin:6px 0; font-size:13px; }
            h2 { margin:0 0 6px; font-size:18px; }
            p { margin:4px 0; font-size:12px; }
            .total { font-weight:700; font-size:14px; }
            @media print { body { margin:0; } .receipt { width:${receiptWidth}; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="section center">
              <h2>${merchantName}</h2>
              <p>${branchName}</p>
              <p>إيصال بيع POS</p>
              <p>رقم الطلب: ${lastCreatedOrder.orderNumber}</p>
              <p>${new Date(lastCreatedOrder.createdAt).toLocaleString("ar-SA")}</p>
            </div>
            <div class="section">
              <p>العميل: ${lastCreatedOrder.customerName || "عميل نقدي"}</p>
              ${
                lastCreatedOrder.customerPhone
                  ? `<p>الهاتف: ${lastCreatedOrder.customerPhone}</p>`
                  : ""
              }
              <p>الخدمة: ${
                DELIVERY_OPTIONS.find(
                  (option) => option.key === lastCreatedOrder.deliveryType,
                )?.label || lastCreatedOrder.deliveryType
              }</p>
              ${lastCreatedOrder.address ? `<p>العنوان: ${lastCreatedOrder.address}</p>` : ""}
            </div>
            <div class="section">${itemsHtml}</div>
            <div class="section">
              <div class="row"><span>الإجمالي الفرعي</span><span>${formatCurrency(lastCreatedOrder.subtotal)}</span></div>
              <div class="row"><span>الخصم</span><span>-${formatCurrency(lastCreatedOrder.discount)}</span></div>
              <div class="row"><span>الضريبة</span><span>${formatCurrency(lastCreatedOrder.taxTotal || 0)}</span></div>
              <div class="row total"><span>الإجمالي</span><span>${formatCurrency(lastCreatedOrder.total)}</span></div>
            </div>
            <div class="section">
              <p><strong>المدفوعات</strong></p>
              ${paymentsHtml}
            </div>
            <div class="center">
              ${lastCreatedOrder.notes ? `<p>${lastCreatedOrder.notes}</p>` : ""}
              <p>شكراً لزيارتكم</p>
            </div>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    opened.document.close();
  }, [
    branches,
    lastCreatedOrder,
    merchantName,
    posSettings.thermalReceiptWidth,
    selectedBranchId,
    selectedOrderPayments,
    toast,
  ]);

  const buildDraftPayload = useCallback(() => {
    const normalizedAddress = deliveryAddress.trim();
    const effectivePayments =
      paymentEntries.filter((entry) => Number(entry.amount) > 0).length > 0
        ? paymentEntries.filter((entry) => Number(entry.amount) > 0)
        : [{ method: paymentMethod, amount: totalAfterDiscount }];

    return {
      branchId: selectedBranchId || undefined,
      shiftId: String(currentShift?.id || "").trim() || undefined,
      registerSessionId: currentRegister?.id || undefined,
      customerId: selectedCustomer?.customerId,
      customerName: (
        customerName.trim() ||
        selectedCustomer?.name ||
        "عميل نقدي"
      ).trim(),
      customerPhone:
        (customerPhone.trim() || selectedCustomer?.phone || "").trim() ||
        undefined,
      serviceMode: deliveryType,
      tableId: selectedTableId || undefined,
      items: cartItems.map((item) => ({
        catalogItemId: item.catalogItemId,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: round2(Number(item.unitPrice)),
        notes: item.notes?.trim() || undefined,
      })),
      discount,
      taxTotal,
      deliveryFee: 0,
      notes: notes.trim() || undefined,
      paymentMethod,
      payments: effectivePayments.map((entry) => ({
        method: entry.method,
        amount: round2(Number(entry.amount) || 0),
        reference: entry.reference?.trim() || undefined,
      })),
      deliveryAddress:
        deliveryType === "delivery" ? normalizedAddress : undefined,
    };
  }, [
    cartItems,
    currentRegister?.id,
    currentShift?.id,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryType,
    discount,
    notes,
    paymentEntries,
    paymentMethod,
    selectedBranchId,
    selectedCustomer,
    selectedTableId,
    taxTotal,
    totalAfterDiscount,
  ]);

  const persistDraft = useCallback(
    async (nextStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE") => {
      if (!apiKey) return null;
      if (cartItems.length === 0) {
        toast({
          title: "لا توجد سلة للحفظ",
          description: "أضف منتجات أولاً قبل حفظ الطلب",
          variant: "destructive",
        });
        return null;
      }

      setSavingDraft(true);
      try {
        const payload = buildDraftPayload();
        const response = currentDraftId
          ? await merchantApi.updatePosDraft(apiKey, currentDraftId, payload)
          : await merchantApi.createPosDraft(apiKey, payload);
        const draft = response?.draft as PosDraft;
        if (nextStatus === "SUSPENDED" && draft?.id) {
          await merchantApi.suspendPosDraft(apiKey, draft.id);
        }
        await Promise.all([loadPosDrafts(), loadPosTables()]);
        if (nextStatus === "SUSPENDED") {
          toast({ title: "تم حفظ الطلب مؤقتاً" });
          clearOrderDraft();
          return null;
        }
        if (draft?.id) {
          setCurrentDraftId(draft.id);
          setSelectedTableId(draft.tableId || null);
        }
        toast({
          title: currentDraftId ? "تم تحديث الطلب المؤقت" : "تم حفظ الطلب",
        });
        return draft;
      } catch (error) {
        toast({
          title: "فشل حفظ الطلب المؤقت",
          description:
            error instanceof Error ? error.message : "تعذر حفظ الطلب حالياً",
          variant: "destructive",
        });
        return null;
      } finally {
        setSavingDraft(false);
      }
    },
    [
      apiKey,
      buildDraftPayload,
      cartItems.length,
      clearOrderDraft,
      currentDraftId,
      loadPosDrafts,
      loadPosTables,
      toast,
    ],
  );

  const handleCheckout = useCallback(async () => {
    if (!apiKey) {
      toast({
        title: "تعذر تنفيذ العملية",
        description: "مفتاح التاجر غير متوفر حالياً",
        variant: "destructive",
      });
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: "السلة فارغة",
        description: "أضف منتجاً واحداً على الأقل قبل تنفيذ الطلب",
        variant: "destructive",
      });
      return;
    }

    const normalizedAddress = deliveryAddress.trim();
    if (deliveryType === "delivery" && !normalizedAddress) {
      toast({
        title: "عنوان التوصيل مطلوب",
        description: "أدخل عنوان التوصيل أو اختر نوع طلب مختلف",
        variant: "destructive",
      });
      return;
    }

    const normalizedName =
      customerName.trim() || selectedCustomer?.name || "عميل نقدي";
    const normalizedPhone =
      customerPhone.trim() || selectedCustomer?.phone || "";
    const normalizedNotes = notes.trim();
    const effectivePayments =
      paymentEntries.filter((entry) => Number(entry.amount) > 0).length > 0
        ? paymentEntries.filter((entry) => Number(entry.amount) > 0)
        : [{ method: paymentMethod, amount: totalAfterDiscount }];

    if (
      posSettings.requireActiveRegisterSession &&
      selectedBranchId &&
      !currentRegister
    ) {
      toast({
        title: "جلسة الكاشير مطلوبة",
        description: "افتح جلسة كاشير لهذا الفرع قبل تنفيذ الطلب",
        variant: "destructive",
      });
      return;
    }

    if (remainingBalance > 0.009) {
      toast({
        title: "التحصيل غير مكتمل",
        description: `المتبقي ${formatCurrency(remainingBalance)}`,
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      const payload = {
        customerId: selectedCustomer?.customerId,
        branchId: selectedBranchId || undefined,
        shiftId: String(currentShift?.id || "").trim() || undefined,
        registerSessionId: currentRegister?.id || undefined,
        tableId: selectedTableId || undefined,
        customerName: normalizedName,
        customerPhone: normalizedPhone || undefined,
        items: cartItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          sku: undefined,
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: round2(Number(item.unitPrice)),
          notes: item.notes?.trim() || undefined,
        })),
        payments: effectivePayments.map((entry) => ({
          method: entry.method,
          amount: round2(Number(entry.amount) || 0),
          reference: entry.reference?.trim() || undefined,
        })),
        serviceMode: deliveryType,
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery" ? normalizedAddress : undefined,
        paymentMethod,
        discount,
        taxTotal,
        notes: normalizedNotes || undefined,
        source: "cashier" as const,
      };

      const created = currentDraftId
        ? await (async () => {
            await merchantApi.updatePosDraft(apiKey, currentDraftId, payload);
            const result = await merchantApi.checkoutPosDraft(
              apiKey,
              currentDraftId,
            );
            return result.order;
          })()
        : await merchantApi.createManualOrder(merchantId, apiKey, payload);

      const responseTotal = Number(
        created?.totalPrice ?? created?.total ?? totalAfterDiscount,
      );

      setLastCreatedOrder({
        id: String(created?.id || "").trim() || undefined,
        orderNumber: String(created?.orderNumber || "---"),
        createdAt: String(created?.createdAt || new Date().toISOString()),
        customerName: normalizedName,
        customerPhone: normalizedPhone,
        paymentMethod,
        deliveryType,
        status: String(created?.status || "").trim() || undefined,
        address: deliveryType === "delivery" ? normalizedAddress : undefined,
        subtotal: Number(created?.subtotal ?? subtotal) || subtotal,
        discount: Number(created?.discount ?? discount) || discount,
        taxTotal: Number(created?.taxTotal ?? taxTotal) || taxTotal,
        total: Number.isFinite(responseTotal)
          ? round2(responseTotal)
          : totalAfterDiscount,
        notes: normalizedNotes || undefined,
        items: cartItems,
      });
      setSelectedOrderPayments(effectivePayments);

      toast({
        title: "تم تنفيذ الطلب بنجاح",
        description: `رقم الطلب: ${String(created?.orderNumber || "---")}`,
      });

      clearOrderDraft();
      await Promise.all([
        loadRecentOrders(),
        loadCurrentShift(),
        loadCurrentRegister(),
        loadPosDrafts(),
        loadPosTables(),
      ]);
    } catch (error) {
      toast({
        title: "فشل تنفيذ الطلب",
        description:
          error instanceof Error
            ? error.message
            : "تعذر إتمام عملية الدفع حالياً",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(false);
    }
  }, [
    apiKey,
    cartItems,
    clearOrderDraft,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryType,
    discount,
    taxTotal,
    merchantId,
    notes,
    paymentEntries,
    paymentMethod,
    posSettings.requireActiveRegisterSession,
    remainingBalance,
    selectedCustomer,
    selectedTableId,
    subtotal,
    toast,
    totalAfterDiscount,
    currentDraftId,
    currentRegister,
    selectedBranchId,
    currentShift,
    loadCurrentRegister,
    loadCurrentShift,
    loadPosDrafts,
    loadPosTables,
    loadRecentOrders,
  ]);

  const updatePaymentEntry = useCallback(
    (index: number, patch: Partial<PaymentEntry>) => {
      setPaymentEntries((prev) =>
        prev.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                ...patch,
                amount:
                  patch.amount !== undefined
                    ? Math.max(0, Number(patch.amount) || 0)
                    : entry.amount,
              }
            : entry,
        ),
      );
    },
    [],
  );

  const addPaymentEntry = useCallback(() => {
    setPaymentEntries((prev) => [
      ...prev,
      { method: paymentMethod, amount: 0 },
    ]);
  }, [paymentMethod]);

  const removePaymentEntry = useCallback((index: number) => {
    setPaymentEntries((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((_, entryIndex) => entryIndex !== index),
    );
  }, []);

  const handleSelectRecentOrder = useCallback(
    async (order: CreatedOrderSummary) => {
      setLastCreatedOrder(order);
      if (!apiKey || !order.id) {
        setSelectedOrderPayments([]);
        return;
      }
      try {
        const response = await merchantApi.listOrderPayments(apiKey, order.id);
        setSelectedOrderPayments(
          Array.isArray(response?.payments)
            ? response.payments.map((payment: any) => ({
                method:
                  String(payment?.method || "")
                    .trim()
                    .toUpperCase() === "CARD"
                    ? "card"
                    : String(payment?.method || "")
                          .trim()
                          .toUpperCase() === "BANK_TRANSFER"
                      ? "transfer"
                      : "cash",
                amount: Number(payment?.amount || 0),
                reference: String(payment?.reference || "").trim() || undefined,
              }))
            : [],
        );
      } catch {
        setSelectedOrderPayments([]);
      }
    },
    [apiKey],
  );

  const handleFullRefund = useCallback(
    async (createExchangeDraft: boolean) => {
      if (!apiKey || !lastCreatedOrder?.id) return;
      setRefundLoading(true);
      try {
        const response = await merchantApi.createPosRefund(
          apiKey,
          lastCreatedOrder.id,
          {
            items: lastCreatedOrder.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            reason: createExchangeDraft ? "POS_EXCHANGE" : "POS_FULL_REFUND",
            restock: true,
            createExchangeDraft,
          },
        );
        toast({
          title: createExchangeDraft
            ? "تم إنشاء مسودة استبدال"
            : "تم تنفيذ الاسترجاع",
          description: `قيمة العملية ${formatCurrency(Number(response?.refund?.amount || 0))}`,
        });
        if (response?.exchangeDraft) {
          hydrateDraftIntoForm(response.exchangeDraft as PosDraft);
        }
        await Promise.all([
          loadRecentOrders(),
          loadPosDrafts(),
          loadPosTables(),
        ]);
      } catch (error) {
        toast({
          title: "فشل تنفيذ العملية",
          description:
            error instanceof Error
              ? error.message
              : "تعذر تنفيذ الاسترجاع حالياً",
          variant: "destructive",
        });
      } finally {
        setRefundLoading(false);
      }
    },
    [
      apiKey,
      hydrateDraftIntoForm,
      lastCreatedOrder,
      loadPosDrafts,
      loadPosTables,
      loadRecentOrders,
      toast,
    ],
  );

  const openPartialRefundSheet = useCallback(() => {
    if (!lastCreatedOrder?.items?.length) return;
    setRefundItemQuantities(
      Object.fromEntries(
        lastCreatedOrder.items.map((item, index) => [index, item.quantity]),
      ),
    );
    setRefundRestock(true);
    setRefundCreateExchange(false);
    setPartialRefundDialog(true);
  }, [lastCreatedOrder]);

  const handlePartialRefund = useCallback(async () => {
    if (!apiKey || !lastCreatedOrder?.id) return;
    const selectedItems = lastCreatedOrder.items
      .map((item, index) => ({
        item,
        index,
        quantity: Math.max(
          0,
          Math.min(item.quantity, Number(refundItemQuantities[index] ?? 0)),
        ),
      }))
      .filter((entry) => entry.quantity > 0);

    if (selectedItems.length === 0) {
      toast({
        title: "حدد عناصر للاسترجاع",
        description: "اختر كمية عنصر واحدة على الأقل قبل التنفيذ",
        variant: "destructive",
      });
      return;
    }

    setRefundLoading(true);
    try {
      const response = await merchantApi.createPosRefund(
        apiKey,
        lastCreatedOrder.id,
        {
          items: selectedItems.map(({ item, quantity }) => ({
            catalogItemId: item.catalogItemId,
            name: item.name,
            quantity,
            unitPrice: item.unitPrice,
          })),
          reason: refundCreateExchange
            ? "POS_PARTIAL_EXCHANGE"
            : "POS_PARTIAL_REFUND",
          restock: refundRestock,
          createExchangeDraft: refundCreateExchange,
        },
      );
      toast({
        title: refundCreateExchange
          ? "تم إنشاء مسودة الاستبدال"
          : "تم تنفيذ الاسترجاع الجزئي",
        description: `قيمة العملية ${formatCurrency(Number(response?.refund?.amount || 0))}`,
      });
      if (response?.exchangeDraft) {
        hydrateDraftIntoForm(response.exchangeDraft as PosDraft);
      }
      setPartialRefundDialog(false);
      await Promise.all([loadRecentOrders(), loadPosDrafts(), loadPosTables()]);
    } catch (error) {
      toast({
        title: "فشل الاسترجاع الجزئي",
        description:
          error instanceof Error
            ? error.message
            : "تعذر تنفيذ الاسترجاع الجزئي حالياً",
        variant: "destructive",
      });
    } finally {
      setRefundLoading(false);
    }
  }, [
    apiKey,
    hydrateDraftIntoForm,
    lastCreatedOrder,
    loadPosDrafts,
    loadPosTables,
    loadRecentOrders,
    refundCreateExchange,
    refundItemQuantities,
    refundRestock,
    toast,
  ]);

  const getDraftForTable = useCallback(
    (table: PosTable | null | undefined) => {
      if (!table?.currentDraftId) return null;
      return (
        posDrafts.find((draft) => draft.id === table.currentDraftId) ||
        (currentDraftId === table.currentDraftId
          ? {
              id: currentDraftId,
              branchId: selectedBranchId || undefined,
              shiftId: String(currentShift?.id || "").trim() || undefined,
              registerSessionId: currentRegister?.id || undefined,
              customerId: selectedCustomer?.customerId,
              customerName:
                customerName || selectedCustomer?.name || "عميل نقدي",
              customerPhone: customerPhone || selectedCustomer?.phone || "",
              serviceMode: deliveryType,
              tableId: selectedTableId,
              items: cartItems,
              discount,
              notes,
              paymentMethod,
              payments: paymentEntries,
              subtotal,
              taxTotal,
              deliveryFee: 0,
              total: totalAfterDiscount,
              status: "ACTIVE",
            }
          : null)
      );
    },
    [
      cartItems,
      currentDraftId,
      currentRegister?.id,
      currentShift?.id,
      customerName,
      customerPhone,
      deliveryType,
      discount,
      notes,
      paymentEntries,
      paymentMethod,
      posDrafts,
      selectedBranchId,
      selectedCustomer,
      selectedTableId,
      subtotal,
      taxTotal,
      totalAfterDiscount,
    ],
  );

  const handleRunTableAction = useCallback(async () => {
    if (!apiKey || !tableActionDialog) return;
    const { table, type } = tableActionDialog;
    try {
      setTableActionLoading(true);
      if (type === "transfer") {
        if (!tableActionTargetId) {
          throw new Error("اختر الطاولة الهدف أولاً");
        }
        await merchantApi.transferTableDraft(
          apiKey,
          table.id,
          tableActionTargetId,
        );
      } else if (type === "merge") {
        const sourceDraftId = table.currentDraftId;
        const targetDraftId =
          posTables.find((entry) => entry.id === tableActionTargetId)
            ?.currentDraftId || "";
        if (!sourceDraftId || !targetDraftId) {
          throw new Error("تعذر تحديد المسودتين المطلوب دمجهما");
        }
        await merchantApi.mergeTableDrafts(apiKey, {
          sourceDraftId,
          targetDraftId,
        });
      } else {
        const selectedItems = Object.entries(splitSelections)
          .map(([itemIndex, quantity]) => ({
            itemIndex: Number(itemIndex),
            quantity: Number(quantity) || 0,
          }))
          .filter((entry) => entry.quantity > 0);
        if (selectedItems.length === 0) {
          throw new Error("حدد عنصراً واحداً على الأقل للتقسيم");
        }
        await merchantApi.splitTableDraft(apiKey, table.id, {
          items: selectedItems,
          targetTableId: tableActionTargetId || undefined,
        });
      }

      toast({ title: "تم تنفيذ العملية على الطاولة" });
      setTableActionDialog(null);
      setTableActionTargetId("");
      setSplitSelections({});
      await Promise.all([loadPosDrafts(), loadPosTables()]);
    } catch (error) {
      toast({
        title: "تعذر تنفيذ العملية على الطاولة",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تنفيذ العملية",
        variant: "destructive",
      });
    } finally {
      setTableActionLoading(false);
    }
  }, [
    apiKey,
    loadPosDrafts,
    loadPosTables,
    posTables,
    splitSelections,
    tableActionDialog,
    tableActionTargetId,
    toast,
  ]);

  const handleCreateTable = useCallback(async () => {
    if (!apiKey || !selectedBranchId || !tableName.trim()) return;
    setCreatingTable(true);
    try {
      await merchantApi.createPosTable(apiKey, {
        branchId: selectedBranchId,
        name: tableName.trim(),
        area: tableArea.trim() || undefined,
        capacity: tableCapacity.trim() ? Number(tableCapacity) : undefined,
      });
      setCreateTableDialog(false);
      setTableName("");
      setTableArea("");
      setTableCapacity("4");
      await loadPosTables();
      toast({ title: "تم إنشاء الطاولة" });
    } catch (error) {
      toast({
        title: "تعذر إنشاء الطاولة",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إنشاء الطاولة",
        variant: "destructive",
      });
    } finally {
      setCreatingTable(false);
    }
  }, [
    apiKey,
    loadPosTables,
    selectedBranchId,
    tableArea,
    tableCapacity,
    tableName,
    toast,
  ]);

  const handleAssignCurrentCartToTable = useCallback(
    async (tableId: string) => {
      if (!apiKey) return;
      try {
        let draftId = currentDraftId;
        if (!draftId) {
          const savedDraft = await persistDraft("ACTIVE");
          draftId = savedDraft?.id || null;
        }
        if (!draftId) return;
        await merchantApi.assignDraftToTable(apiKey, tableId, draftId);
        await Promise.all([loadPosDrafts(), loadPosTables()]);
        setSelectedTableId(tableId);
        setDeliveryType("dine_in");
        toast({ title: "تم ربط الطلب بالطاولة" });
      } catch (error) {
        toast({
          title: "تعذر ربط الطلب بالطاولة",
          description:
            error instanceof Error ? error.message : "حدث خطأ أثناء ربط الطلب",
          variant: "destructive",
        });
      }
    },
    [apiKey, currentDraftId, loadPosDrafts, loadPosTables, persistDraft, toast],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditableTarget =
        !!target &&
        (target.isContentEditable ||
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select");

      if (isEditableTarget) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printReceipt();
        return;
      }

      if (lastCreatedOrder) {
        if (event.key === "Enter") {
          event.preventDefault();
          startNewOrder();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void handleCheckout();
        return;
      }

      if (cartItems.length === 0) return;

      const isPlusKey =
        event.key === "+" ||
        event.key === "=" ||
        event.key === "Add" ||
        event.code === "NumpadAdd";
      const isMinusKey =
        event.key === "-" ||
        event.key === "_" ||
        event.key === "Subtract" ||
        event.code === "NumpadSubtract";

      if (!isPlusKey && !isMinusKey) return;

      event.preventDefault();

      const resolvedIndex =
        activeCartIndex >= 0 && activeCartIndex < cartItems.length
          ? activeCartIndex
          : cartItems.length - 1;
      const selectedItem = cartItems[resolvedIndex];
      if (!selectedItem) return;

      const nextQuantity = isPlusKey
        ? selectedItem.quantity + 1
        : Math.max(1, selectedItem.quantity - 1);

      updateCartItem(resolvedIndex, { quantity: nextQuantity });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeCartIndex,
    cartItems,
    handleCheckout,
    lastCreatedOrder,
    printReceipt,
    startNewOrder,
    updateCartItem,
  ]);

  return (
    <div
      dir="rtl"
      className="cashier-shell cashier-shell--calm min-h-screen bg-[var(--bg)]"
    >
      <div className="mx-auto flex min-h-[100dvh] max-w-[1680px] flex-col px-3 py-3 lg:h-screen lg:px-4">
        <header className="cashier-command-bar cashier-command-bar--calm mb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--accent)]/25 bg-[var(--accent-muted)] text-[var(--accent)]">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
                  {merchantName}
                </p>
                <p className="text-sm text-[var(--text-muted)]">وضع الكاشير</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-9 px-3 text-sm">
                <ArrowUpDown className="ml-1 h-4 w-4" />
                {selectedBranchId
                  ? branches.find((branch) => branch.id === selectedBranchId)
                      ?.name || "الفرع"
                  : "بدون فرع"}
              </Badge>
              <Badge variant="secondary" className="h-9 px-3 text-sm">
                <ShoppingCart className="ml-1 h-4 w-4" />
                {cartItemsCount} عنصر
              </Badge>
              <Badge variant="secondary" className="h-9 px-3 text-sm">
                <Banknote className="ml-1 h-4 w-4" />
                {formatCurrency(totalAfterDiscount)}
              </Badge>
              <Button asChild variant="outline" className="h-9 px-4">
                <Link href="/merchant/orders">
                  <ArrowRight className="ml-1 h-4 w-4" />
                  الخروج من الكاشير
                </Link>
              </Button>
            </div>
          </div>
          <div className="cashier-command-bar__stats">
            <div className="cashier-command-bar__stat">
              <span className="cashier-command-bar__stat-label">
                حالة الجلسة
              </span>
              <strong className="cashier-command-bar__stat-value">
                {registerLoading
                  ? "جارٍ التحقق..."
                  : currentRegister?.status === "open"
                    ? "جلسة مفتوحة"
                    : "لا توجد جلسة نشطة"}
              </strong>
            </div>
            <div className="cashier-command-bar__stat">
              <span className="cashier-command-bar__stat-label">
                نوع الخدمة
              </span>
              <strong className="cashier-command-bar__stat-value">
                {DELIVERY_OPTIONS.find((option) => option.key === deliveryType)
                  ?.label || "استلام"}
              </strong>
            </div>
            <div className="cashier-command-bar__stat">
              <span className="cashier-command-bar__stat-label">
                وسيلة الدفع
              </span>
              <strong className="cashier-command-bar__stat-value">
                {PAYMENT_OPTIONS.find((option) => option.key === paymentMethod)
                  ?.label || "نقدي"}
              </strong>
            </div>
            <div className="cashier-command-bar__stat">
              <span className="cashier-command-bar__stat-label">
                الإجمالي الحالي
              </span>
              <strong className="cashier-command-bar__stat-value">
                {formatCurrency(totalAfterDiscount)}
              </strong>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row-reverse">
          <Card className="app-data-card app-data-card--muted flex min-h-0 flex-1 flex-col">
            <CardHeader className="border-b border-border/70 bg-[color:color-mix(in_srgb,var(--surface-muted)_42%,transparent)] pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-emerald-600" />
                  كتالوج المنتجات
                </CardTitle>
                <p className="app-section-copy mt-1">
                  بحث سريع بالاسم أو SKU أو الباركود مع إضافة مباشرة للسلة.
                </p>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleBarcodeAdd();
                      }
                    }}
                    placeholder="أضف بالباركود أو SKU"
                    className="h-10 rounded-xl pr-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl px-4"
                  onClick={() => void handleBarcodeAdd()}
                  disabled={barcodeLoading || barcodeInput.trim().length === 0}
                >
                  {barcodeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو SKU"
                  className="h-10 rounded-xl pr-9"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {categories.map((category) => {
                  const isActive = activeCategory === category;
                  return (
                    <Button
                      key={category}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      className={cn(
                        "h-8 rounded-full px-3 text-xs",
                        isActive && "bg-emerald-600 hover:bg-emerald-700",
                      )}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category === "all" ? "الكل" : category}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pb-4">
              {catalogLoading ? (
                <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                  جاري تحميل المنتجات...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-[var(--text-muted)]">
                  لا توجد منتجات مطابقة للبحث الحالي
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      className="flex min-h-[132px] flex-col justify-between rounded-[22px] border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-3 text-right transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-[var(--bg-surface-2)] hover:shadow-[0_20px_38px_-28px_rgba(15,23,42,0.45)]"
                    >
                      <div>
                        <p className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.category}
                        </p>
                        {product.sku && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                            {product.sku}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(product.unitPrice)}
                        </span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="app-data-card flex min-h-0 w-full flex-col lg:w-[40%] xl:w-[37%]">
            <CardHeader className="border-b border-border/70 bg-[color:color-mix(in_srgb,var(--surface-muted)_42%,transparent)] pb-3">
              <CardTitle className="flex flex-col gap-2 text-base sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  سلة الطلب
                </span>
                <Badge variant="outline" className="rounded-full">
                  {cartItemsCount} عنصر
                </Badge>
              </CardTitle>
              <p className="app-section-copy">
                الاختصارات: <strong>Enter</strong> تنفيذ الطلب،{" "}
                <strong>+</strong> زيادة الكمية، <strong>-</strong> تقليل
                الكمية، <strong>Ctrl+P</strong> طباعة الإيصال
              </p>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
              {lastCreatedOrder ? (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-base font-semibold text-emerald-900">
                        تم تنفيذ الطلب بنجاح
                      </p>
                      <p className="text-sm text-emerald-800">
                        رقم الطلب: {lastCreatedOrder.orderNumber}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 rounded-xl bg-white/80 p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">الإجمالي</span>
                      <span className="font-semibold">
                        {formatCurrency(lastCreatedOrder.total)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">الدفع</span>
                      <span className="font-medium">
                        {
                          PAYMENT_OPTIONS.find(
                            (option) =>
                              option.key === lastCreatedOrder.paymentMethod,
                          )?.label
                        }
                      </span>
                    </div>
                    {selectedOrderPayments.length > 0 ? (
                      <div className="space-y-1 pt-1">
                        {selectedOrderPayments.map((entry, index) => (
                          <div
                            key={`${entry.method}-${index}`}
                            className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="text-muted-foreground">
                              {
                                PAYMENT_OPTIONS.find(
                                  (option) => option.key === entry.method,
                                )?.label
                              }
                            </span>
                            <span className="font-medium">
                              {formatCurrency(entry.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">الوقت</span>
                      <span className="font-medium">
                        {new Date(lastCreatedOrder.createdAt).toLocaleString(
                          "ar-SA",
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="h-10 w-full flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                      onClick={printReceipt}
                    >
                      <Printer className="ml-2 h-4 w-4" />
                      طباعة الإيصال
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full flex-1 rounded-xl"
                      onClick={startNewOrder}
                    >
                      <Plus className="ml-2 h-4 w-4" />
                      طلب جديد
                    </Button>
                  </div>
                  {posSettings.returnsEnabled && lastCreatedOrder.id ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={() => void handleFullRefund(false)}
                        disabled={refundLoading}
                      >
                        <RotateCcw className="ml-2 h-4 w-4" />
                        استرجاع كامل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={() => void handleFullRefund(true)}
                        disabled={refundLoading}
                      >
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        استبدال
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={openPartialRefundSheet}
                        disabled={refundLoading}
                      >
                        <ClipboardList className="ml-2 h-4 w-4" />
                        استرجاع جزئي
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border bg-background p-3">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          الفرع وجلسة نقطة البيع
                        </p>
                        <p className="text-xs text-muted-foreground">
                          الوردية تابعة للفرع، لكن جلسة الكاشير هنا هي جلسة
                          الصندوق الفعلية التي تحسب النقدية والتحصيل.
                        </p>
                      </div>
                      {shiftLoading || registerLoading || settingsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          الفرع
                        </label>
                        <select
                          value={selectedBranchId}
                          onChange={(event) =>
                            setSelectedBranchId(event.target.value)
                          }
                          className="flex h-9 w-full rounded-lg border bg-background px-3 text-sm"
                        >
                          <option value="">بدون ربط بفرع</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                              {branch.city ? ` - ${branch.city}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 w-full rounded-lg sm:w-auto"
                          onClick={() => void loadBranches()}
                          disabled={branchesLoading}
                        >
                          {branchesLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        {selectedBranchId ? (
                          currentRegister ? (
                            <Button
                              type="button"
                              variant="destructive"
                              className="h-9 w-full rounded-lg sm:w-auto"
                              onClick={() => setCloseShiftDialog(true)}
                            >
                              <Square className="ml-2 h-4 w-4" />
                              إغلاق الجلسة
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              className="h-9 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                              onClick={() => setOpenShiftDialog(true)}
                            >
                              <Plus className="ml-2 h-4 w-4" />
                              فتح جلسة
                            </Button>
                          )
                        ) : null}
                      </div>
                    </div>

                    {selectedBranchId ? (
                      currentRegister ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-center">
                          <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
                            جلسة مفتوحة
                          </Badge>
                          <span>
                            فتحت في{" "}
                            {new Date(
                              currentRegister.openedAt || Date.now(),
                            ).toLocaleString("ar-SA")}
                          </span>
                          <span className="text-muted-foreground">
                            نقد افتتاحي:{" "}
                            {formatCurrency(
                              Number(currentRegister.openingFloat ?? 0),
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            النقد المتوقع:{" "}
                            {formatCurrency(
                              Number(currentRegister.expectedCash ?? 0),
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            عدد الطلبات:{" "}
                            {Number(
                              currentRegister.totalOrders ?? 0,
                            ).toLocaleString("ar-SA")}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          لا توجد جلسة POS مفتوحة لهذا الفرع حالياً.
                          {posSettings.requireActiveRegisterSession
                            ? " لن تستطيع تنفيذ البيع قبل فتح الجلسة."
                            : " يمكنك الاستمرار، لكن البيع لن يرتبط بصندوق مفتوح."}
                        </div>
                      )
                    ) : (
                      <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        لم يتم اختيار فرع بعد. اختيار الفرع يربط الطلبات
                        بالتقارير والجلسات.
                      </div>
                    )}
                  </div>

                  {posSettings.suspendedSalesEnabled && (
                    <div className="rounded-2xl border bg-background p-3">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            الطلبات المعلقة
                          </p>
                          <p className="text-xs text-muted-foreground">
                            احفظ السلة مؤقتاً أو استكمل طلباً محفوظاً من أي جهاز
                            داخل نفس المتجر.
                          </p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 w-full rounded-full px-3 text-xs sm:w-auto"
                            onClick={() => void persistDraft("ACTIVE")}
                            disabled={savingDraft || cartItems.length === 0}
                          >
                            حفظ الآن
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 w-full rounded-full px-3 text-xs sm:w-auto"
                            onClick={() => void persistDraft("SUSPENDED")}
                            disabled={savingDraft || cartItems.length === 0}
                          >
                            حفظ مؤقت
                          </Button>
                        </div>
                      </div>

                      {currentDraftId ? (
                        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                          يوجد طلب جاري مرتبط بالمسودة الحالية. أي تعديل في
                          السلة سيُحفظ عليها عند التنفيذ أو التحديث.
                        </div>
                      ) : null}

                      {draftsLoading ? (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          جاري تحميل الطلبات المعلقة...
                        </div>
                      ) : posDrafts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          لا توجد طلبات معلقة لهذا الفرع حالياً.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {posDrafts.slice(0, 5).map((draft) => (
                            <div
                              key={draft.id}
                              className={cn(
                                "rounded-xl border px-3 py-2",
                                currentDraftId === draft.id
                                  ? "border-blue-300 bg-blue-50"
                                  : "bg-muted/20",
                              )}
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold">
                                    {draft.customerName || "عميل نقدي"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {draft.items.reduce(
                                      (sum, item) =>
                                        sum + Number(item.quantity || 0),
                                      0,
                                    )}{" "}
                                    عنصر • {formatCurrency(draft.total)}
                                  </p>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 w-full rounded-full px-3 text-xs sm:w-auto"
                                    onClick={() => hydrateDraftIntoForm(draft)}
                                  >
                                    استكمال
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 w-full rounded-full px-3 text-xs text-red-600 hover:text-red-700 sm:w-auto"
                                    onClick={async () => {
                                      if (!apiKey) return;
                                      await merchantApi.deletePosDraft(
                                        apiKey,
                                        draft.id,
                                      );
                                      if (currentDraftId === draft.id)
                                        clearOrderDraft();
                                      await Promise.all([
                                        loadPosDrafts(),
                                        loadPosTables(),
                                      ]);
                                    }}
                                  >
                                    حذف
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-2xl border bg-background p-3">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          مساعد الكاشير
                        </p>
                        <p className="text-xs text-muted-foreground">
                          اقتراحات تشغيلية حتمية مبنية على سياق POS والتنبؤات.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full rounded-full px-3 sm:w-auto"
                        onClick={() => void loadCashierCopilotSuggestions()}
                        disabled={cashierCopilotLoading}
                      >
                        {cashierCopilotLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={cashierCopilotQuery}
                        onChange={(event) =>
                          setCashierCopilotQuery(event.target.value)
                        }
                        className="h-9 rounded-lg"
                        placeholder="سؤال سريع للمساعد (مثال: خصم أو مخزون)"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-lg px-4"
                        onClick={() =>
                          void loadCashierCopilotSuggestions(
                            cashierCopilotQuery,
                          )
                        }
                        disabled={cashierCopilotLoading}
                      >
                        <Sparkles className="ml-1 h-4 w-4" />
                        تحليل
                      </Button>
                    </div>

                    {cashierCopilotLoading ? (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري تجهيز اقتراحات الكاشير...
                      </div>
                    ) : !cashierCopilotData ? (
                      <p className="text-xs text-muted-foreground">
                        لا توجد اقتراحات حالياً.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                          <div className="rounded-lg border bg-muted/30 px-2 py-1">
                            طلبات اليوم:{" "}
                            {
                              cashierCopilotData.contextDigest
                                .todayCashierOrders
                            }
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-2 py-1">
                            إيراد اليوم:{" "}
                            {formatCurrency(
                              cashierCopilotData.contextDigest
                                .todayCashierRevenue,
                            )}
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-2 py-1">
                            إجراءات معلقة:{" "}
                            {cashierCopilotData.contextDigest.pendingApprovals}
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-2 py-1">
                            جلسات مفتوحة:{" "}
                            {cashierCopilotData.contextDigest.openRegisters}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {cashierCopilotData.suggestions.map((suggestion) => (
                            <div
                              key={suggestion.id}
                              className={cn(
                                "rounded-lg border px-3 py-2",
                                getSuggestionTone(suggestion.priority),
                              )}
                            >
                              <p className="text-sm font-semibold text-slate-900">
                                {suggestion.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-700">
                                {suggestion.body}
                              </p>
                              {suggestion.action?.label ? (
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-[11px] font-medium text-slate-700">
                                    إجراء مقترح: {suggestion.action.label}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      suggestion.action.requiresApproval
                                        ? "default"
                                        : "outline"
                                    }
                                    className="h-7 rounded-full px-3 text-[11px]"
                                    onClick={() =>
                                      void handleCashierSuggestionAction(
                                        suggestion,
                                      )
                                    }
                                  >
                                    {suggestion.action.requiresApproval
                                      ? "مراجعة واعتماد"
                                      : suggestion.action.label}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        {showCashierApprovalsPanel ? (
                          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-900">
                                إجراءات تحتاج موافقة
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full px-2 text-[11px]"
                                onClick={() =>
                                  void loadCashierCopilotApprovals("pending")
                                }
                                disabled={cashierCopilotApprovalsLoading}
                              >
                                {cashierCopilotApprovalsLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>

                            {cashierCopilotApprovalsLoading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                جاري تحميل إجراءات الموافقة...
                              </div>
                            ) : cashierCopilotApprovals.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                لا توجد إجراءات معلقة حالياً.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {cashierCopilotApprovals.map((approval) => {
                                  const isBusy =
                                    approvalActionLoadingId ===
                                    approval.actionId;
                                  return (
                                    <div
                                      key={approval.actionId}
                                      className="rounded-md border bg-white px-2 py-2"
                                    >
                                      <p className="text-xs font-medium text-slate-900">
                                        {approval.previewSummary ||
                                          `إجراء ${approval.intent}`}
                                      </p>
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        المخاطرة: {approval.riskTier} • الحالة:{" "}
                                        {approval.status}
                                      </p>
                                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-7 rounded-full px-3 text-[11px]"
                                          onClick={() =>
                                            void confirmCashierCopilotApproval(
                                              approval.actionId,
                                              true,
                                            )
                                          }
                                          disabled={isBusy}
                                        >
                                          {isBusy ? (
                                            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
                                          )}
                                          اعتماد
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 rounded-full px-3 text-[11px]"
                                          onClick={() =>
                                            void confirmCashierCopilotApproval(
                                              approval.actionId,
                                              false,
                                            )
                                          }
                                          disabled={isBusy}
                                        >
                                          رفض
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {posSettings.tablesEnabled && (
                    <div className="rounded-2xl border bg-background p-3">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            طاولات الفرع
                          </p>
                          <p className="text-xs text-muted-foreground">
                            اختر طاولة فارغة لربط السلة بها أو افتح طاولة مشغولة
                            لاستكمالها.
                          </p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 w-full rounded-full px-3 text-xs sm:w-auto"
                            onClick={() => setCreateTableDialog(true)}
                            disabled={!selectedBranchId}
                          >
                            <Plus className="ml-1 h-3.5 w-3.5" />
                            طاولة جديدة
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full rounded-full px-2 sm:w-auto"
                            onClick={() => void loadPosTables()}
                            disabled={tablesLoading}
                          >
                            {tablesLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {posTables.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          لا توجد طاولات معرفة لهذا الفرع حتى الآن.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {posTables.map((table) => {
                            const isSelected = selectedTableId === table.id;
                            const isOccupied = table.status === "OCCUPIED";
                            return (
                              <div
                                key={table.id}
                                className={cn(
                                  "rounded-xl border p-3",
                                  isSelected
                                    ? "border-blue-300 bg-blue-50"
                                    : isOccupied
                                      ? "border-amber-300 bg-amber-50"
                                      : "bg-muted/20",
                                )}
                              >
                                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-sm font-semibold">
                                    {table.name}
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="rounded-full text-[10px]"
                                  >
                                    {isOccupied ? "مشغولة" : "فارغة"}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {table.area || "بدون منطقة"}
                                  {table.capacity
                                    ? ` • ${table.capacity} أفراد`
                                    : ""}
                                </p>
                                {table.currentDraft ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {table.currentDraft.customerName ||
                                      "جلسة طاولة"}{" "}
                                    • {formatCurrency(table.currentDraft.total)}
                                  </p>
                                ) : null}
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                  {isOccupied && table.currentDraftId ? (
                                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 rounded-full px-3 text-xs"
                                        onClick={() => {
                                          const linkedDraft = posDrafts.find(
                                            (draft) =>
                                              draft.id === table.currentDraftId,
                                          );
                                          if (linkedDraft) {
                                            hydrateDraftIntoForm(linkedDraft);
                                          } else if (apiKey) {
                                            void merchantApi
                                              .resumePosDraft(
                                                apiKey,
                                                table.currentDraftId!,
                                              )
                                              .then((response) =>
                                                hydrateDraftIntoForm(
                                                  response.draft as PosDraft,
                                                ),
                                              );
                                          }
                                        }}
                                      >
                                        فتح
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 rounded-full px-3 text-xs"
                                        onClick={() => {
                                          setTableActionDialog({
                                            type: "transfer",
                                            table,
                                          });
                                          setTableActionTargetId("");
                                          setSplitSelections({});
                                        }}
                                      >
                                        نقل
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 rounded-full px-3 text-xs"
                                        onClick={() => {
                                          const draft = getDraftForTable(table);
                                          setTableActionDialog({
                                            type: "split",
                                            table,
                                          });
                                          setTableActionTargetId("");
                                          setSplitSelections(
                                            Object.fromEntries(
                                              (draft?.items || []).map(
                                                (item, index) => [
                                                  index,
                                                  Math.min(1, item.quantity),
                                                ],
                                              ),
                                            ),
                                          );
                                        }}
                                      >
                                        تقسيم
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 rounded-full px-3 text-xs"
                                        onClick={() => {
                                          setTableActionDialog({
                                            type: "merge",
                                            table,
                                          });
                                          setTableActionTargetId("");
                                          setSplitSelections({});
                                        }}
                                      >
                                        دمج
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 flex-1 rounded-full px-3 text-xs"
                                      onClick={() =>
                                        void handleAssignCurrentCartToTable(
                                          table.id,
                                        )
                                      }
                                      disabled={
                                        cartItems.length === 0 &&
                                        !currentDraftId
                                      }
                                    >
                                      ربط الطلب
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 rounded-2xl border bg-muted/20 p-3">
                    {cartItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        ابدأ بإضافة منتجات إلى السلة
                      </p>
                    ) : (
                      cartItems.map((item, index) => (
                        <div
                          key={`${item.catalogItemId || item.name}-${index}`}
                          className={cn(
                            "rounded-xl border bg-background p-3 transition",
                            activeCartIndex === index &&
                              "border-emerald-400 ring-2 ring-emerald-200",
                          )}
                          onClick={() => setActiveCartIndex(index)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(item.unitPrice)} للوحدة
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCartItem(index)}
                              className="rounded-full p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                              aria-label="حذف عنصر"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                updateCartItem(index, {
                                  quantity: item.quantity - 1,
                                })
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onFocus={() => setActiveCartIndex(index)}
                              onChange={(event) =>
                                updateCartItem(index, {
                                  quantity: Number(event.target.value),
                                })
                              }
                              className="h-8 w-20 text-center"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                updateCartItem(index, {
                                  quantity: item.quantity + 1,
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="mr-auto text-sm font-semibold text-slate-900">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border bg-background p-3">
                    <div className="space-y-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-3">
                      <label className="block text-xs font-medium text-muted-foreground">
                        ابحث عن عميل موجود
                      </label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={customerSearch}
                          onChange={(event) =>
                            setCustomerSearch(event.target.value)
                          }
                          className="h-9 rounded-lg pr-9"
                          placeholder="اسم العميل أو رقم الهاتف"
                        />
                      </div>
                      {customerSearchLoading ? (
                        <p className="text-xs text-muted-foreground">
                          جاري البحث عن العملاء...
                        </p>
                      ) : customerResults.length > 0 ? (
                        <div className="max-h-44 space-y-2 overflow-y-auto">
                          {customerResults.map((customer) => (
                            <button
                              key={customer.customerId}
                              type="button"
                              onClick={() => applySelectedCustomer(customer)}
                              className="w-full rounded-lg border bg-white px-3 py-2 text-right transition hover:border-emerald-300 hover:bg-emerald-50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {customer.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {customer.phone || "بدون هاتف"}
                                  </p>
                                </div>
                                <div className="text-left">
                                  {customer.loyaltyTier ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full"
                                    >
                                      {customer.loyaltyTier}
                                    </Badge>
                                  ) : null}
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {customer.loyaltyPoints.toLocaleString(
                                      "ar-SA",
                                    )}{" "}
                                    نقطة
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : customerSearch.trim().length >= 2 ? (
                        <p className="text-xs text-muted-foreground">
                          لا توجد نتائج مطابقة
                        </p>
                      ) : null}

                      {selectedCustomer ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
                          <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
                            عميل مرتبط
                          </Badge>
                          <span>{selectedCustomer.name}</span>
                          {selectedCustomer.loyaltyTier ? (
                            <Badge variant="outline" className="rounded-full">
                              {selectedCustomer.loyaltyTier}
                            </Badge>
                          ) : null}
                          <span className="text-muted-foreground">
                            {selectedCustomer.loyaltyPoints.toLocaleString(
                              "ar-SA",
                            )}{" "}
                            نقطة
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          اسم العميل (اختياري)
                        </label>
                        <Input
                          value={customerName}
                          onChange={(event) =>
                            setCustomerName(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="عميل نقدي"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          رقم الهاتف (اختياري)
                        </label>
                        <Input
                          value={customerPhone}
                          onChange={(event) =>
                            setCustomerPhone(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="01000000000"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        نوع الطلب
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {DELIVERY_OPTIONS.map((option) => {
                          const isActive = deliveryType === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setDeliveryType(option.key)}
                              className={cn(
                                "flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition",
                                isActive
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedTableId && deliveryType === "dine_in" ? (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                        الطلب الحالي مرتبط بطاولة{" "}
                        {posTables.find((table) => table.id === selectedTableId)
                          ?.name || "داخل الفرع"}
                      </div>
                    ) : null}

                    {deliveryType === "delivery" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          عنوان التوصيل
                        </label>
                        <Input
                          value={deliveryAddress}
                          onChange={(event) =>
                            setDeliveryAddress(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="الحي - الشارع - رقم المبنى"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        طريقة الدفع الأساسية
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {PAYMENT_OPTIONS.map((option) => {
                          const isActive = paymentMethod === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setPaymentMethod(option.key)}
                              className={cn(
                                "flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition",
                                isActive
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {posSettings.splitPaymentsEnabled && (
                      <div className="space-y-2 rounded-xl border border-dashed p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <label className="text-xs font-medium text-muted-foreground">
                            بنود التحصيل
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-7 w-full rounded-full px-2 text-xs sm:w-auto"
                            onClick={addPaymentEntry}
                          >
                            <Plus className="ml-1 h-3.5 w-3.5" />
                            وسيلة أخرى
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {paymentEntries.map((entry, index) => (
                            <div
                              key={`${entry.method}-${index}`}
                              className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto]"
                            >
                              <select
                                value={entry.method}
                                onChange={(event) =>
                                  updatePaymentEntry(index, {
                                    method: event.target.value as PaymentMethod,
                                  })
                                }
                                className="flex h-9 rounded-lg border bg-background px-3 text-sm"
                              >
                                {PAYMENT_OPTIONS.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={entry.amount}
                                onChange={(event) =>
                                  updatePaymentEntry(index, {
                                    amount: Number(event.target.value),
                                  })
                                }
                                className="h-9 rounded-lg"
                                placeholder="0.00"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg px-3"
                                onClick={() => removePaymentEntry(index)}
                                disabled={paymentEntries.length <= 1}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">
                            المحصل حتى الآن
                          </span>
                          <span className="font-medium">
                            {formatCurrency(totalPaid)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">المتبقي</span>
                          <span
                            className={cn(
                              "font-medium",
                              remainingBalance > 0
                                ? "text-amber-700"
                                : "text-emerald-700",
                            )}
                          >
                            {formatCurrency(remainingBalance)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        الضريبة / الرسوم
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={taxInput}
                        onChange={(event) => setTaxInput(event.target.value)}
                        className="h-9 rounded-lg"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        خصم (اختياري)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={discountInput}
                        onChange={(event) =>
                          setDiscountInput(event.target.value)
                        }
                        className="h-9 rounded-lg"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        ملاحظات الطلب
                      </label>
                      <Textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className="min-h-[70px] rounded-lg"
                        placeholder="تعليمات إضافية للكاشير أو التوصيل"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-background p-3">
                    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">
                        الإجمالي الفرعي
                      </span>
                      <span className="font-medium">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">الخصم</span>
                      <span className="font-medium text-red-600">
                        -{formatCurrency(discount)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">
                        الضريبة / الرسوم
                      </span>
                      <span className="font-medium">
                        {formatCurrency(taxTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-base font-semibold sm:flex-row sm:items-center sm:justify-between">
                      <span>المطلوب تحصيله</span>
                      <span>{formatCurrency(totalAfterDiscount)}</span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>المحصل</span>
                      <span>{formatCurrency(totalPaid)}</span>
                    </div>
                    {remainingBalance > 0 ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        ما زال هناك مبلغ متبقٍ قبل تنفيذ الطلب:{" "}
                        {formatCurrency(remainingBalance)}
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "mt-3 grid gap-2",
                        posSettings.suspendedSalesEnabled
                          ? "grid-cols-1 sm:grid-cols-3"
                          : "grid-cols-1 sm:grid-cols-2",
                      )}
                    >
                      {posSettings.suspendedSalesEnabled ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl"
                          onClick={() => void persistDraft("SUSPENDED")}
                          disabled={
                            checkoutLoading ||
                            savingDraft ||
                            cartItems.length === 0
                          }
                        >
                          حفظ مؤقت
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={clearOrderDraft}
                        disabled={checkoutLoading}
                      >
                        تفريغ السلة
                      </Button>
                      <Button
                        type="button"
                        className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                        onClick={handleCheckout}
                        disabled={checkoutLoading || cartItems.length === 0}
                      >
                        {checkoutLoading ? (
                          <>
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                            جاري التنفيذ...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="ml-2 h-4 w-4" />
                            تنفيذ الطلب
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-background p-3">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          آخر مبيعات الكاشير
                        </p>
                        <p className="text-xs text-muted-foreground">
                          مرتبطة مباشرة بطلبات النظام الحالية
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full rounded-full px-3 sm:w-auto"
                        onClick={() => void loadRecentOrders()}
                        disabled={recentOrdersLoading}
                      >
                        {recentOrdersLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {recentOrdersLoading ? (
                      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري تحميل آخر الطلبات...
                      </div>
                    ) : recentOrders.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        لا توجد مبيعات كاشير حديثة بعد
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {recentOrders.map((order) => (
                          <button
                            key={
                              order.id ||
                              `${order.orderNumber}-${order.createdAt}`
                            }
                            type="button"
                            onClick={() => void handleSelectRecentOrder(order)}
                            className="w-full rounded-xl border px-3 py-2 text-right transition hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {order.customerName || "عميل نقدي"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {order.orderNumber}
                                  {order.status ? ` • ${order.status}` : ""}
                                  {order.paymentStatus
                                    ? ` • ${order.paymentStatus}`
                                    : ""}
                                </p>
                                {order.branchName ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    {order.branchName}
                                    {order.registerSessionId
                                      ? ` • صندوق ${order.registerSessionId.slice(0, 8)}`
                                      : ""}
                                  </p>
                                ) : null}
                              </div>
                              <div className="text-right sm:text-left">
                                <p className="text-sm font-semibold text-emerald-700">
                                  {formatCurrency(order.total)}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {new Date(order.createdAt).toLocaleString(
                                    "ar-SA",
                                  )}
                                </p>
                                {order.refundsAmount &&
                                order.refundsAmount > 0 ? (
                                  <p className="text-[11px] text-rose-600">
                                    مرتجع {formatCurrency(order.refundsAmount)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <section id="cashier-receipt" className="hidden" dir="rtl">
        {lastCreatedOrder && (
          <div className="receipt-inner">
            <div className="receipt-head">
              <h2>{merchantName}</h2>
              <p>إيصال كاشير</p>
              <p>رقم الطلب: {lastCreatedOrder.orderNumber}</p>
              <p>
                {new Date(lastCreatedOrder.createdAt).toLocaleString("ar-SA")}
              </p>
            </div>

            <div className="receipt-block">
              <p>العميل: {lastCreatedOrder.customerName}</p>
              <p>الهاتف: {lastCreatedOrder.customerPhone}</p>
              <p>
                النوع:{" "}
                {
                  DELIVERY_OPTIONS.find(
                    (option) => option.key === lastCreatedOrder.deliveryType,
                  )?.label
                }
              </p>
              {lastCreatedOrder.address && (
                <p>العنوان: {lastCreatedOrder.address}</p>
              )}
            </div>

            <div className="receipt-items">
              {lastCreatedOrder.items.map((item, index) => (
                <div
                  className="receipt-row"
                  key={`${item.catalogItemId || item.name}-${index}`}
                >
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatCurrency(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>

            <div className="receipt-summary">
              <div className="receipt-row">
                <span>الإجمالي الفرعي</span>
                <span>{formatCurrency(lastCreatedOrder.subtotal)}</span>
              </div>
              <div className="receipt-row">
                <span>الخصم</span>
                <span>-{formatCurrency(lastCreatedOrder.discount)}</span>
              </div>
              <div className="receipt-row total">
                <span>الإجمالي</span>
                <span>{formatCurrency(lastCreatedOrder.total)}</span>
              </div>
            </div>

            <div className="receipt-foot">
              <p>
                الدفع:{" "}
                {
                  PAYMENT_OPTIONS.find(
                    (option) => option.key === lastCreatedOrder.paymentMethod,
                  )?.label
                }
              </p>
              {lastCreatedOrder.notes ? <p>{lastCreatedOrder.notes}</p> : null}
              <p>شكراً لزيارتكم</p>
            </div>
          </div>
        )}
      </section>

      <Dialog open={openShiftDialog} onOpenChange={setOpenShiftDialog}>
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>فتح جلسة كاشير</DialogTitle>
            <DialogDescription>
              افتح صندوق الكاشير لهذا الفرع حتى ترتبط المدفوعات النقدية
              والمبيعات بنفس الجلسة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cashier-opening-cash">النقد الافتتاحي</Label>
              <Input
                id="cashier-opening-cash"
                type="number"
                min={0}
                step="0.01"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashier-open-notes">ملاحظات الافتتاح</Label>
              <Textarea
                id="cashier-open-notes"
                value={openShiftNotes}
                onChange={(event) => setOpenShiftNotes(event.target.value)}
                className="min-h-[90px]"
                placeholder="ملاحظات سريعة عن بداية الوردية"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button
              type="button"
              className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
              onClick={() => void handleOpenShift()}
              disabled={openingShift}
            >
              {openingShift ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الفتح...
                </>
              ) : (
                "فتح الجلسة"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setOpenShiftDialog(false)}
              disabled={openingShift}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftDialog} onOpenChange={setCloseShiftDialog}>
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>إغلاق جلسة الكاشير</DialogTitle>
            <DialogDescription>
              أدخل النقد الفعلي في الصندوق ليتم حساب الفرق مقابل التحصيل
              المتوقع.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">النقد المتوقع</span>
                <span className="font-medium">
                  {formatCurrency(Number(currentRegister?.expectedCash ?? 0))}
                </span>
              </div>
            </div>
            {registerSummary ? (
              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-background px-3 py-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    إجمالي الطلبات
                  </p>
                  <p className="mt-1 font-semibold">
                    {Number(
                      registerSummary.totals?.totalOrders ?? 0,
                    ).toLocaleString("ar-SA")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المحصل</p>
                  <p className="mt-1 font-semibold">
                    {formatCurrency(
                      Number(registerSummary.totals?.paidAmount ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">نقدي</p>
                  <p className="mt-1 font-semibold">
                    {formatCurrency(
                      Number(registerSummary.totals?.cashAmount ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">بطاقات/تحويل</p>
                  <p className="mt-1 font-semibold">
                    {formatCurrency(
                      Number(registerSummary.totals?.cardAmount ?? 0) +
                        Number(registerSummary.totals?.transferAmount ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">مرتجعات</p>
                  <p className="mt-1 font-semibold">
                    {formatCurrency(
                      Number(registerSummary.totals?.refundsAmount ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">النقد المتوقع</p>
                  <p className="mt-1 font-semibold">
                    {formatCurrency(
                      Number(registerSummary.totals?.expectedCash ?? 0),
                    )}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="cashier-closing-cash">
                النقد الفعلي عند الإغلاق
              </Label>
              <Input
                id="cashier-closing-cash"
                type="number"
                min={0}
                step="0.01"
                value={closingCash}
                onChange={(event) => setClosingCash(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashier-close-notes">ملاحظات الإغلاق</Label>
              <Textarea
                id="cashier-close-notes"
                value={closeShiftNotes}
                onChange={(event) => setCloseShiftNotes(event.target.value)}
                className="min-h-[90px]"
                placeholder="أي ملاحظات عن العجز أو الزيادة أو التسليم"
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleCloseShift()}
              disabled={closingShift}
            >
              {closingShift ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإغلاق...
                </>
              ) : (
                "إغلاق الجلسة"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCloseShiftDialog(false)}
              disabled={closingShift}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createTableDialog} onOpenChange={setCreateTableDialog}>
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>إضافة طاولة جديدة</DialogTitle>
            <DialogDescription>
              أنشئ طاولة جديدة لهذا الفرع حتى يمكن ربط طلبات الأكل داخل الفرع
              بها.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pos-table-name">اسم الطاولة</Label>
              <Input
                id="pos-table-name"
                value={tableName}
                onChange={(event) => setTableName(event.target.value)}
                placeholder="مثال: T1 أو طاولة 5"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pos-table-area">المنطقة</Label>
                <Input
                  id="pos-table-area"
                  value={tableArea}
                  onChange={(event) => setTableArea(event.target.value)}
                  placeholder="الصالة / التراس"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-table-capacity">السعة</Label>
                <Input
                  id="pos-table-capacity"
                  type="number"
                  min={1}
                  value={tableCapacity}
                  onChange={(event) => setTableCapacity(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void handleCreateTable()}
              disabled={creatingTable || !selectedBranchId || !tableName.trim()}
            >
              {creatingTable ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإنشاء...
                </>
              ) : (
                "إنشاء الطاولة"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateTableDialog(false)}
              disabled={creatingTable}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partialRefundDialog} onOpenChange={setPartialRefundDialog}>
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>استرجاع جزئي</DialogTitle>
            <DialogDescription>
              حدد العناصر والكميات المطلوب استرجاعها. يمكن أيضاً إنشاء مسودة
              استبدال من نفس العملية.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {(lastCreatedOrder?.items || []).map((item, index) => (
                <div
                  key={`${item.catalogItemId || item.name}-${index}`}
                  className="grid grid-cols-1 gap-3 rounded-lg border px-3 py-2 sm:grid-cols-[1fr_90px] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      مباع: {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={refundItemQuantities[index] ?? 0}
                    onChange={(event) =>
                      setRefundItemQuantities((current) => ({
                        ...current,
                        [index]: Math.max(
                          0,
                          Math.min(
                            item.quantity,
                            Number(event.target.value) || 0,
                          ),
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={refundRestock}
                onChange={(event) => setRefundRestock(event.target.checked)}
              />
              إعادة الأصناف إلى المخزون
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={refundCreateExchange}
                onChange={(event) =>
                  setRefundCreateExchange(event.target.checked)
                }
              />
              إنشاء مسودة استبدال بعد الاسترجاع
            </label>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => void handlePartialRefund()}
              disabled={refundLoading}
            >
              {refundLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري التنفيذ...
                </>
              ) : (
                "تنفيذ الاسترجاع الجزئي"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPartialRefundDialog(false)}
              disabled={refundLoading}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(tableActionDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setTableActionDialog(null);
            setTableActionTargetId("");
            setSplitSelections({});
          }
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>
              {tableActionDialog?.type === "transfer"
                ? "نقل طاولة"
                : tableActionDialog?.type === "merge"
                  ? "دمج طاولتين"
                  : "تقسيم فاتورة الطاولة"}
            </DialogTitle>
            <DialogDescription>
              {tableActionDialog?.type === "transfer"
                ? "انقل المسودة الحالية إلى طاولة فارغة أخرى."
                : tableActionDialog?.type === "merge"
                  ? "ادمج هذه المسودة مع مسودة طاولة مشغولة أخرى."
                  : "اختر العناصر أو الكميات التي تريد نقلها إلى مسودة جديدة أو طاولة أخرى."}
            </DialogDescription>
          </DialogHeader>
          {tableActionDialog ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                الطاولة الحالية:{" "}
                <span className="font-semibold">
                  {tableActionDialog.table.name}
                </span>
              </div>
              {tableActionDialog.type === "split" ? (
                <div className="space-y-2">
                  {(getDraftForTable(tableActionDialog.table)?.items || []).map(
                    (item, index) => (
                      <div
                        key={`${item.catalogItemId || item.name}-${index}`}
                        className="grid grid-cols-1 gap-3 rounded-lg border px-3 py-2 sm:grid-cols-[1fr_90px] sm:items-center"
                      >
                        <div>
                          <p className="break-words text-sm font-medium">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            الكمية الحالية: {item.quantity}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={splitSelections[index] ?? 0}
                          onChange={(event) =>
                            setSplitSelections((current) => ({
                              ...current,
                              [index]: Math.max(
                                0,
                                Math.min(
                                  item.quantity,
                                  Number(event.target.value) || 0,
                                ),
                              ),
                            }))
                          }
                        />
                      </div>
                    ),
                  )}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>الطاولة الهدف</Label>
                <select
                  value={tableActionTargetId}
                  onChange={(event) =>
                    setTableActionTargetId(event.target.value)
                  }
                  className="flex h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="">اختر طاولة</option>
                  {posTables
                    .filter((table) => {
                      if (!tableActionDialog) return false;
                      if (table.id === tableActionDialog.table.id) return false;
                      if (tableActionDialog.type === "transfer") {
                        return table.status !== "OCCUPIED";
                      }
                      if (tableActionDialog.type === "merge") {
                        return (
                          table.status === "OCCUPIED" && !!table.currentDraftId
                        );
                      }
                      return true;
                    })
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name}
                        {table.area ? ` - ${table.area}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => void handleRunTableAction()}
              disabled={tableActionLoading}
            >
              {tableActionLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري التنفيذ...
                </>
              ) : (
                "تنفيذ العملية"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTableActionDialog(null);
                setTableActionTargetId("");
                setSplitSelections({});
              }}
              disabled={tableActionLoading}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          body {
            margin: 0;
            background: #fff;
          }

          .cashier-shell {
            min-height: auto !important;
            background: #fff !important;
          }

          .cashier-shell > * {
            display: none !important;
          }

          #cashier-receipt {
            display: block !important;
            width: 80mm;
            margin: 0 auto;
            padding: 3mm;
            font-size: 11px;
            color: #111;
            font-family: "Arial", sans-serif;
            direction: rtl;
          }

          #cashier-receipt .receipt-inner {
            border: 1px dashed #9ca3af;
            padding: 3mm;
          }

          #cashier-receipt .receipt-head {
            text-align: center;
            border-bottom: 1px dashed #9ca3af;
            padding-bottom: 2mm;
            margin-bottom: 2mm;
          }

          #cashier-receipt .receipt-head h2 {
            font-size: 14px;
            margin: 0 0 1mm 0;
          }

          #cashier-receipt .receipt-head p {
            margin: 0.5mm 0;
          }

          #cashier-receipt .receipt-block {
            border-bottom: 1px dashed #9ca3af;
            margin-bottom: 2mm;
            padding-bottom: 2mm;
          }

          #cashier-receipt .receipt-block p {
            margin: 0.5mm 0;
          }

          #cashier-receipt .receipt-items,
          #cashier-receipt .receipt-summary {
            border-bottom: 1px dashed #9ca3af;
            margin-bottom: 2mm;
            padding-bottom: 2mm;
          }

          #cashier-receipt .receipt-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 4mm;
            margin: 1mm 0;
          }

          #cashier-receipt .receipt-row.total {
            font-weight: 700;
            margin-top: 1.5mm;
          }

          #cashier-receipt .receipt-foot {
            text-align: center;
          }

          #cashier-receipt .receipt-foot p {
            margin: 0.8mm 0;
          }
        }
      `}</style>
    </div>
  );
}
