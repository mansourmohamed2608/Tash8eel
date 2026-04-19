// Supported merchant categories (MVP scope)
export enum MerchantCategory {
  CLOTHES = "CLOTHES",
  FOOD = "FOOD",
  SUPERMARKET = "SUPERMARKET",
  GENERIC = "GENERIC",
}

// Conversation states (deterministic state machine)
export enum ConversationState {
  GREETING = "GREETING",
  COLLECTING_ITEMS = "COLLECTING_ITEMS",
  COLLECTING_VARIANTS = "COLLECTING_VARIANTS",
  COLLECTING_CUSTOMER_INFO = "COLLECTING_CUSTOMER_INFO",
  COLLECTING_ADDRESS = "COLLECTING_ADDRESS",
  NEGOTIATING = "NEGOTIATING",
  CONFIRMING_ORDER = "CONFIRMING_ORDER",
  ORDER_PLACED = "ORDER_PLACED",
  TRACKING = "TRACKING",
  FOLLOWUP = "FOLLOWUP",
  CLOSED = "CLOSED",
  HUMAN_TAKEOVER = "HUMAN_TAKEOVER",
}

// Order statuses
export enum OrderStatus {
  DRAFT = "DRAFT",
  CONFIRMED = "CONFIRMED",
  BOOKED = "BOOKED",
  SHIPPED = "SHIPPED",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

// Event statuses
export enum EventStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// DLQ statuses
export enum DlqStatus {
  PENDING = "PENDING",
  RETRYING = "RETRYING",
  RESOLVED = "RESOLVED",
  EXHAUSTED = "EXHAUSTED",
}

// LLM Action types (allowlist)
export enum ActionType {
  ASK_CLARIFYING_QUESTION = "ASK_CLARIFYING_QUESTION",
  UPDATE_CART = "UPDATE_CART",
  CREATE_ORDER = "CREATE_ORDER",
  BOOK_DELIVERY = "BOOK_DELIVERY",
  SEND_TRACKING = "SEND_TRACKING",
  SCHEDULE_FOLLOWUP = "SCHEDULE_FOLLOWUP",
  SEND_REPORT = "SEND_REPORT",
  ESCALATE_TO_HUMAN = "ESCALATE_TO_HUMAN",
  GREET = "GREET",
  CONFIRM_ORDER = "CONFIRM_ORDER",
  HANDLE_NEGOTIATION = "HANDLE_NEGOTIATION",
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  TRACK_ORDER = "TRACK_ORDER",
  ESCALATE = "ESCALATE",
  COLLECT_SLOTS = "COLLECT_SLOTS",
  COUNTER_OFFER = "COUNTER_OFFER",
  ACCEPT_NEGOTIATION = "ACCEPT_NEGOTIATION",
  REJECT_NEGOTIATION = "REJECT_NEGOTIATION",
  // Customer reorder flow
  REORDER_LAST = "REORDER_LAST",
  CONFIRM_REORDER = "CONFIRM_REORDER",
}

// Message direction
export enum MessageDirection {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

// Slot types for slot filling
export enum SlotType {
  PRODUCT = "product",
  QUANTITY = "quantity",
  SIZE = "size",
  COLOR = "color",
  OPTIONS = "options",
  SUBSTITUTION_PREFERENCE = "substitution_preference",
  CUSTOMER_NAME = "customer_name",
  PHONE = "phone",
  ADDRESS_CITY = "address_city",
  ADDRESS_AREA = "address_area",
  ADDRESS_STREET = "address_street",
  ADDRESS_BUILDING = "address_building",
  ADDRESS_FLOOR = "address_floor",
  ADDRESS_APARTMENT = "address_apartment",
  ADDRESS_LANDMARK = "address_landmark",
}
