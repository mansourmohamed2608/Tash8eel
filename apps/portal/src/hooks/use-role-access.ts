"use client";

import { useSession } from "next-auth/react";

/**
 * Role hierarchy: OWNER(100) > ADMIN(80) > MANAGER(60) > AGENT(40) > CASHIER(30) > VIEWER(20)
 *
 * Permissions matrix:
 * ┌─────────────────┬───────┬───────┬─────────┬───────┬────────┐
 * │ Section         │ OWNER │ ADMIN │ MANAGER │ AGENT │ VIEWER │
 * ├─────────────────┼───────┼───────┼─────────┼───────┼────────┤
 * │ Orders          │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Conversations   │ Full  │ Full  │ Full    │ Reply │ View   │
 * │ Customers       │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Products/KB     │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Inventory       │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Reports         │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Expenses        │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Payments        │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Notifications   │ Full  │ Full  │ Full    │ Own   │ Own    │
 * │ Loyalty         │ Full  │ Full  │ Full    │ View  │ View   │
 * │ Import/Export   │ Full  │ Full  │ Full    │ ❌    │ ❌     │
 * │ Plan/Billing    │ Full  │ Full  │ View    │ ❌    │ ❌     │
 * │ Team            │ Full  │ ❌    │ ❌      │ ❌    │ ❌     │
 * │ Settings        │ Full  │ Full  │ ❌      │ ❌    │ ❌     │
 * │ Webhooks        │ Full  │ Full  │ ❌      │ ❌    │ ❌     │
 * │ Audit           │ Full  │ Full  │ ❌      │ ❌    │ ❌     │
 * └─────────────────┴───────┴───────┴─────────┴───────┴────────┘
 */

export type StaffRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "AGENT"
  | "CASHIER"
  | "VIEWER";

const ROLE_LEVEL: Record<StaffRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  AGENT: 40,
  CASHIER: 30,
  VIEWER: 20,
};

export type PageSection =
  | "orders"
  | "conversations"
  | "customers"
  | "products"
  | "inventory"
  | "knowledge-base"
  | "reports"
  | "analytics"
  | "expenses"
  | "payments"
  | "notifications"
  | "loyalty"
  | "kpis"
  | "import-export"
  | "plan"
  | "feature-requests"
  | "team"
  | "settings"
  | "webhooks"
  | "audit"
  | "dashboard"
  | "onboarding"
  | "assistant"
  | "help"
  | "vision";

interface RoleAccess {
  /** Current user role */
  role: StaffRole;
  /** Can view data on the page */
  canView: boolean;
  /** Can create new items */
  canCreate: boolean;
  /** Can edit existing items */
  canEdit: boolean;
  /** Can delete items */
  canDelete: boolean;
  /** Can export data (CSV, PDF) */
  canExport: boolean;
  /** Can import data (bulk upload) */
  canImport: boolean;
  /** Can approve/reject items */
  canApprove: boolean;
  /** Can manage settings/configuration for this section */
  canManageSettings: boolean;
  /** Entirely read-only (no actions at all) */
  isReadOnly: boolean;
  /** Quick check: at least MANAGER level */
  isManager: boolean;
  /** Quick check: at least ADMIN level */
  isAdmin: boolean;
  /** Quick check: OWNER */
  isOwner: boolean;
  /** Loading state */
  isLoading: boolean;
}

/**
 * Returns granular permission flags for the current user on a given page section.
 *
 * Usage:
 * ```tsx
 * const { canCreate, canDelete, isReadOnly } = useRoleAccess('inventory');
 *
 * // Hide create button for viewers/agents
 * {canCreate && <Button onClick={handleAdd}>إضافة منتج</Button>}
 *
 * // Disable delete for read-only users
 * <Button disabled={!canDelete} onClick={handleDelete}>حذف</Button>
 * ```
 */
export function useRoleAccess(section: PageSection): RoleAccess {
  const { data: session, status } = useSession();
  const role = (session?.user?.role as StaffRole) || "VIEWER";
  const level = ROLE_LEVEL[role] ?? 0;

  const isLoading = status === "loading";
  const isOwner = role === "OWNER";
  const isAdmin = level >= ROLE_LEVEL.ADMIN;
  const isManager = level >= ROLE_LEVEL.MANAGER;
  const isAgent = role === "AGENT";
  const isCashier = role === "CASHIER";

  // Default: full access for MANAGER+, read-only for AGENT/VIEWER
  let canView = true;
  let canCreate = isManager;
  let canEdit = isManager;
  let canDelete = isManager;
  let canExport = isManager;
  let canImport = isManager;
  let canApprove = isManager;
  let canManageSettings = isAdmin;

  // Section-specific overrides
  switch (section) {
    case "conversations":
      // AGENT can reply to messages (create = send message)
      canCreate = isAgent ? true : isManager;
      canEdit = isAgent ? true : isManager; // takeover/release
      canDelete = isManager;
      break;

    case "orders":
      canCreate = isCashier || isManager;
      canEdit = isCashier || isManager;
      canDelete = isManager;
      canExport = isManager;
      break;

    case "customers":
      // Cashier can update customer details during checkout.
      canCreate = isManager;
      canEdit = isCashier || isManager;
      canDelete = isManager;
      break;

    case "inventory":
    case "products":
    case "knowledge-base":
      // Full CRUD for MANAGER+, view only for AGENT/VIEWER
      canCreate = isManager;
      canEdit = isManager;
      canDelete = isManager;
      canImport = isManager;
      canExport = isManager;
      break;

    case "payments":
      canCreate = isCashier || isManager;
      canApprove = isManager;
      canDelete = isManager;
      break;

    case "expenses":
      canCreate = isCashier || isManager;
      canDelete = isManager;
      canEdit = isCashier || isManager;
      break;

    case "reports":
    case "analytics":
    case "kpis":
    case "dashboard":
      // View for all, export for MANAGER+
      canCreate = false;
      canEdit = false;
      canDelete = false;
      canExport = isManager;
      canImport = false;
      break;

    case "notifications":
      // Everyone can manage their OWN notifications (mark read, prefs)
      canCreate = false;
      canEdit = true; // own preferences
      canDelete = true; // own notifications
      // But notification SETTINGS (channels, templates) require MANAGER
      canManageSettings = isManager;
      break;

    case "loyalty":
      // MANAGER+ can create/toggle promotions, tiers, enroll
      canCreate = isManager;
      canEdit = isManager;
      canDelete = isManager;
      break;

    case "import-export":
      // Only MANAGER+ can import/export bulk data
      canView = isManager;
      canCreate = isManager;
      canImport = isManager;
      canExport = isManager;
      break;

    case "plan":
      // Only ADMIN+ can change plan/billing
      canView = true;
      canCreate = isAdmin;
      canEdit = isAdmin;
      canManageSettings = isAdmin;
      break;

    case "feature-requests":
      // Everyone can create feature requests, but only ADMIN+ can accept quotes
      canCreate = true;
      canApprove = isAdmin;
      canEdit = isManager;
      break;

    case "team":
      // OWNER only (already blocked by middleware)
      canView = isOwner;
      canCreate = isOwner;
      canEdit = isOwner;
      canDelete = isOwner;
      canManageSettings = isOwner;
      break;

    case "settings":
    case "webhooks":
    case "audit":
      // ADMIN+ only (already blocked by middleware)
      canView = isAdmin;
      canCreate = isAdmin;
      canEdit = isAdmin;
      canDelete = isAdmin;
      canManageSettings = isAdmin;
      break;

    case "onboarding":
    case "help":
    case "assistant":
    case "vision":
      // Available to all
      canCreate = true;
      canEdit = true;
      break;
  }

  if (isCashier) {
    canExport = false;
    canImport = false;
    canApprove = false;
    canManageSettings = false;
  }

  const isReadOnly =
    !canCreate &&
    !canEdit &&
    !canDelete &&
    !canExport &&
    !canImport &&
    !canApprove;

  return {
    role,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canExport,
    canImport,
    canApprove,
    canManageSettings,
    isReadOnly,
    isManager,
    isAdmin,
    isOwner,
    isLoading,
  };
}

/** Helper: Arabic label for role */
export function getRoleLabel(role: StaffRole): string {
  const labels: Record<StaffRole, string> = {
    OWNER: "مالك",
    ADMIN: "مدير",
    MANAGER: "مشرف",
    AGENT: "وكيل",
    CASHIER: "كاشير",
    VIEWER: "مشاهد",
  };
  return labels[role] || role;
}
