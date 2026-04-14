import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  mockRouterPush,
  mockToast,
  merchantApiMock,
  branchesApiMock,
  apiFetchMock,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockToast: vi.fn(),
  merchantApiMock: {
    getSettings: vi.fn(),
    getCatalogItems: vi.fn(),
    getCurrentPosRegister: vi.fn(),
    getPosRegisterSummary: vi.fn(),
    listPosDrafts: vi.fn(),
    listPosTables: vi.fn(),
    getOrders: vi.fn(),
    getCashierCopilotSuggestions: vi.fn(),
    copilotApprovals: vi.fn(),
    copilotConfirm: vi.fn(),
  } as any,
  branchesApiMock: {
    list: vi.fn(),
    getCurrentShift: vi.fn(),
  } as any,
  apiFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/merchant/cashier",
}));

vi.mock("@/hooks/use-merchant", () => ({
  useMerchant: () => ({
    merchantId: "merchant-1",
    apiKey: "api-key-1",
    merchant: {
      id: "merchant-1",
      name: "Merchant",
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("@/lib/client", () => ({
  merchantApi: merchantApiMock,
  branchesApi: branchesApiMock,
  apiFetch: apiFetchMock,
}));

import CashierPage from "@/app/merchant/cashier/page";

function getButtonByExactText(label: string): HTMLButtonElement {
  const button = screen
    .getAllByRole("button")
    .find((candidate) => candidate.textContent?.trim() === label);

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

describe("Cashier approvals panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    merchantApiMock.getSettings.mockResolvedValue({ pos: {} });
    merchantApiMock.getCatalogItems.mockResolvedValue({ items: [] });
    merchantApiMock.getCurrentPosRegister.mockResolvedValue({ data: null });
    merchantApiMock.getPosRegisterSummary.mockResolvedValue({ data: null });
    merchantApiMock.listPosDrafts.mockResolvedValue({ drafts: [] });
    merchantApiMock.listPosTables.mockResolvedValue({ tables: [] });
    merchantApiMock.getOrders.mockResolvedValue({ orders: [] });
    merchantApiMock.getCashierCopilotSuggestions.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      contextDigest: {
        todayCashierOrders: 2,
        todayCashierRevenue: 500,
        pendingApprovals: 1,
        openRegisters: 1,
        activeDrafts: 0,
        forecastRisks: {
          lowConfidencePredictions: 0,
          staleRuns: 0,
          highUrgencyReplenishments: 0,
        },
      },
      suggestions: [
        {
          id: "pending-approvals",
          type: "alert",
          priority: "high",
          title: "يوجد إجراءات Copilot بانتظار قرار",
          body: "يوجد إجراء معلق.",
          action: {
            kind: "review_approvals",
            label: "مراجعة الإجراءات",
            requiresApproval: true,
            payload: {
              status: "pending",
            },
          },
        },
      ],
    });
    merchantApiMock.copilotApprovals.mockResolvedValue({
      success: true,
      approvals: [
        {
          actionId: "action-1",
          intent: "CREATE_ORDER",
          status: "pending",
          previewSummary: "إنشاء طلب جديد",
          expiresAt: null,
          riskTier: "high",
        },
      ],
      pagination: {
        total: 1,
        limit: 8,
        offset: 0,
      },
    });
    merchantApiMock.copilotConfirm.mockResolvedValue({
      success: true,
      action: "confirmed",
    });

    branchesApiMock.list.mockResolvedValue({
      branches: [{ id: "branch-1", name: "Main" }],
    });
    branchesApiMock.getCurrentShift.mockResolvedValue({ data: null });
    apiFetchMock.mockResolvedValue({ customers: [] });
  });

  test("approves and rejects pending copilot actions from cashier panel", async () => {
    const user = userEvent.setup();
    render(<CashierPage />);

    const reviewButton = await screen.findByRole("button", {
      name: /مراجعة واعتماد/i,
    });
    await user.click(reviewButton);

    await waitFor(() => {
      expect(merchantApiMock.copilotApprovals).toHaveBeenCalledWith(
        "api-key-1",
        expect.objectContaining({ status: "pending", limit: 8, offset: 0 }),
      );
    });

    const approveButton = getButtonByExactText("اعتماد");
    await user.click(approveButton);

    await waitFor(() => {
      expect(merchantApiMock.copilotConfirm).toHaveBeenCalledWith(
        "api-key-1",
        "action-1",
        true,
      );
    });

    const rejectButton = getButtonByExactText("رفض");
    await user.click(rejectButton);

    await waitFor(() => {
      expect(merchantApiMock.copilotConfirm).toHaveBeenCalledWith(
        "api-key-1",
        "action-1",
        false,
      );
    });
  });
});
