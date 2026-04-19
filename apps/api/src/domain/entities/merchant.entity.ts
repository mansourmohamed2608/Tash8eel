import {
  MerchantCategory,
  MerchantConfig,
  NegotiationRules,
  DeliveryRules,
  Branding,
} from "../../shared/schemas";

export interface Merchant {
  id: string;
  name: string;
  category: MerchantCategory;
  config: MerchantConfig;
  branding: Branding;
  negotiationRules: NegotiationRules;
  deliveryRules: DeliveryRules;
  dailyTokenBudget: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Additional properties used in services
  apiKey?: string;
  city?: string;
  language?: string;
  currency?: string;
  timezone?: string;
  notificationPhone?: string;
  notificationEmail?: string;
  whatsappNumber?: string;
  whatsappReportsEnabled?: boolean;
  reportPeriodsEnabled?: string[];
  autoResponseEnabled?: boolean;
  followupDelayMinutes?: number;
  paymentRemindersEnabled?: boolean;
  lowStockAlertsEnabled?: boolean;
  autoPaymentLinkOnConfirm?: boolean;
  requireCustomerContactForPaymentLink?: boolean;
  paymentLinkChannel?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  enabledNotificationTypes?: string[];
  defaultDeliveryFee?: number;
  autoBookDelivery?: boolean;
  enableFollowups?: boolean;
  greetingTemplate?: string;
  workingHours?:
    | { start?: string; end?: string }
    | { open?: string; close?: string };
  address?: string;
  knowledgeBase?: Record<string, any>;
}

export interface MerchantTokenUsage {
  id: string;
  merchantId: string;
  usageDate: string;
  tokensUsed: number;
  llmCalls: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMerchantInput {
  id: string;
  name: string;
  category?: MerchantCategory;
  config?: Partial<MerchantConfig>;
  branding?: Partial<Branding>;
  negotiationRules?: Partial<NegotiationRules>;
  deliveryRules?: Partial<DeliveryRules>;
  dailyTokenBudget?: number;
  // Additional properties
  apiKey?: string;
  city?: string;
  language?: string;
  currency?: string;
  defaultDeliveryFee?: number;
  autoBookDelivery?: boolean;
  enableFollowups?: boolean;
  greetingTemplate?: string;
  workingHours?: { open: string; close: string };
  address?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UpdateMerchantInput {
  name?: string;
  category?: MerchantCategory;
  config?: Partial<MerchantConfig>;
  branding?: Partial<Branding>;
  negotiationRules?: Partial<NegotiationRules>;
  // Additional properties
  apiKey?: string;
  city?: string;
  language?: string;
  currency?: string;
  defaultDeliveryFee?: number;
  autoBookDelivery?: boolean;
  enableFollowups?: boolean;
  greetingTemplate?: string;
  workingHours?: { open: string; close: string };
  address?: string;
  deliveryRules?: Partial<DeliveryRules>;
  dailyTokenBudget?: number;
  isActive?: boolean;
}
