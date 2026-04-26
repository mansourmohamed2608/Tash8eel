import { Injectable } from "@nestjs/common";
import {
  RuntimeContextV2,
  ToolActionNameV2,
  ToolActionResultV2,
} from "./ai-v2.types";

export interface ToolExecutionInputV2 {
  actionName: ToolActionNameV2;
  runtimeContext: RuntimeContextV2;
}

@Injectable()
export class ToolRegistryV2 {
  async execute(input: ToolExecutionInputV2): Promise<ToolActionResultV2> {
    switch (input.actionName) {
      case "searchCatalog":
        return this.searchCatalog(input.runtimeContext);
      case "getCatalogItem":
        return this.getCatalogItem(input.runtimeContext);
      case "calculateQuote":
        return this.calculateQuote(input.runtimeContext);
      case "getMerchantPaymentSettings":
        return this.getMerchantPaymentSettings(input.runtimeContext);
      case "searchPublicKB":
        return this.searchPublicKB(input.runtimeContext);
      case "getBusinessRules":
        return this.getBusinessRules(input.runtimeContext);
      case "getOrderStatus":
        return unavailable(
          input.actionName,
          "ORDER_STATUS_TOOL_NOT_WIRED",
          "Order status lookup is not available from AI v2 yet.",
        );
      case "createDraftOrder":
        return unavailable(
          input.actionName,
          "CREATE_DRAFT_ORDER_TOOL_NOT_WIRED",
          "AI v2 can collect order details, but cannot create the draft order yet.",
        );
      case "updateDraftOrder":
        return unavailable(
          input.actionName,
          "UPDATE_DRAFT_ORDER_TOOL_NOT_WIRED",
          "AI v2 can update collected order details, but cannot update a backend draft order yet.",
        );
      case "recordComplaintNote":
        return unavailable(
          input.actionName,
          "COMPLAINT_NOTE_TOOL_NOT_WIRED",
          "AI v2 can collect complaint details, but cannot record a backend complaint note yet.",
        );
      case "recordCustomerFeedback":
        return unavailable(
          input.actionName,
          "CUSTOMER_FEEDBACK_TOOL_NOT_WIRED",
          "AI v2 can acknowledge feedback, but cannot record backend feedback yet.",
        );
      case "attachProductMedia":
        return unavailable(
          input.actionName,
          "PRODUCT_MEDIA_TOOL_NOT_WIRED",
          "AI v2 cannot attach product media to backend records yet.",
        );
      case "verifyPaymentProof":
        return unavailable(
          input.actionName,
          "PAYMENT_PROOF_TOOL_NOT_WIRED",
          "AI v2 cannot verify payment proof yet.",
        );
      default:
        return unavailable(input.actionName, "UNKNOWN_TOOL");
    }
  }

  private searchCatalog(ctx: RuntimeContextV2): ToolActionResultV2 {
    const ids = ctx.ragFacts.catalogFacts.map((fact) => fact.id);
    return {
      actionName: "searchCatalog",
      available: true,
      attempted: true,
      success: ids.length > 0,
      resultFactIds: ids,
      safeMessage:
        ids.length > 0
          ? "Catalog facts found."
          : "No matching catalog facts found.",
      errorCode: ids.length > 0 ? null : "NO_CATALOG_FACTS",
    };
  }

  private getCatalogItem(ctx: RuntimeContextV2): ToolActionResultV2 {
    const selectedCatalogIds = new Set(
      ctx.selectedItems.map((item) => item.catalogItemId).filter(Boolean),
    );
    const ids = ctx.ragFacts.catalogFacts
      .filter(
        (fact) =>
          fact.catalogItemId && selectedCatalogIds.has(fact.catalogItemId),
      )
      .map((fact) => fact.id);
    return {
      actionName: "getCatalogItem",
      available: true,
      attempted: true,
      success: ids.length > 0,
      resultFactIds: ids,
      safeMessage: ids.length > 0 ? "Selected catalog item facts found." : null,
      errorCode: ids.length > 0 ? null : "CATALOG_ITEM_NOT_RESOLVED",
    };
  }

  private calculateQuote(ctx: RuntimeContextV2): ToolActionResultV2 {
    const itemFacts = ctx.ragFacts.catalogFacts.filter(
      (fact) => fact.price !== undefined && fact.price !== null,
    );
    if (itemFacts.length === 0) {
      return {
        actionName: "calculateQuote",
        available: true,
        attempted: true,
        success: false,
        resultFactIds: [],
        safeMessage: null,
        errorCode: "PRICE_FACTS_UNAVAILABLE",
      };
    }
    return {
      actionName: "calculateQuote",
      available: true,
      attempted: true,
      success: true,
      resultFactIds: itemFacts.map((fact) => fact.id),
      safeMessage:
        "Quote can be calculated only from returned catalog price facts.",
      errorCode: null,
    };
  }

  private getMerchantPaymentSettings(
    ctx: RuntimeContextV2,
  ): ToolActionResultV2 {
    const ids = ctx.merchantFacts
      .filter((fact) => fact.type === "payment_method")
      .map((fact) => fact.id);
    return {
      actionName: "getMerchantPaymentSettings",
      available: true,
      attempted: true,
      success: ids.length > 0,
      resultFactIds: ids,
      safeMessage: ids.length > 0 ? "Payment settings found." : null,
      errorCode: ids.length > 0 ? null : "PAYMENT_SETTINGS_UNAVAILABLE",
    };
  }

  private searchPublicKB(ctx: RuntimeContextV2): ToolActionResultV2 {
    const ids = ctx.ragFacts.kbFacts.map((fact) => fact.id);
    return {
      actionName: "searchPublicKB",
      available: true,
      attempted: true,
      success: ids.length > 0,
      resultFactIds: ids,
      safeMessage: ids.length > 0 ? "Public KB facts found." : null,
      errorCode: ids.length > 0 ? null : "PUBLIC_KB_FACTS_UNAVAILABLE",
    };
  }

  private getBusinessRules(ctx: RuntimeContextV2): ToolActionResultV2 {
    const ids = ctx.ragFacts.businessRuleFacts.map((fact) => fact.id);
    return {
      actionName: "getBusinessRules",
      available: true,
      attempted: true,
      success: ids.length > 0,
      resultFactIds: ids,
      safeMessage: ids.length > 0 ? "Business rule facts found." : null,
      errorCode: ids.length > 0 ? null : "BUSINESS_RULES_UNAVAILABLE",
    };
  }
}

function unavailable(
  actionName: ToolActionNameV2,
  errorCode: string,
  safeMessage = "This AI v2 action is not available yet.",
): ToolActionResultV2 {
  return {
    actionName,
    available: false,
    attempted: false,
    success: false,
    resultFactIds: [],
    safeMessage,
    errorCode,
  };
}
