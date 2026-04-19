/**
 * Marketing Agent Task Definitions (Stub)
 */

export interface CreateCampaignInput {
  merchantId: string;
  name: string;
  type: "broadcast" | "triggered" | "scheduled";
  targetAudience?: string[];
}

export interface SendPromotionInput {
  merchantId: string;
  customerId: string;
  promotionCode: string;
  channel: "whatsapp" | "sms" | "email";
}

export interface SegmentCustomersInput {
  merchantId: string;
  criteria: {
    minOrders?: number;
    lastActiveWithinDays?: number;
    totalSpent?: number;
  };
}
