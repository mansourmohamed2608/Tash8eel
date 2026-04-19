"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotType = exports.MessageDirection = exports.ActionType = exports.DlqStatus = exports.EventStatus = exports.OrderStatus = exports.ConversationState = exports.MerchantCategory = void 0;
// Supported merchant categories (MVP scope)
var MerchantCategory;
(function (MerchantCategory) {
    MerchantCategory["CLOTHES"] = "CLOTHES";
    MerchantCategory["FOOD"] = "FOOD";
    MerchantCategory["SUPERMARKET"] = "SUPERMARKET";
    MerchantCategory["GENERIC"] = "GENERIC";
})(MerchantCategory || (exports.MerchantCategory = MerchantCategory = {}));
// Conversation states (deterministic state machine)
var ConversationState;
(function (ConversationState) {
    ConversationState["GREETING"] = "GREETING";
    ConversationState["COLLECTING_ITEMS"] = "COLLECTING_ITEMS";
    ConversationState["COLLECTING_VARIANTS"] = "COLLECTING_VARIANTS";
    ConversationState["COLLECTING_CUSTOMER_INFO"] = "COLLECTING_CUSTOMER_INFO";
    ConversationState["COLLECTING_ADDRESS"] = "COLLECTING_ADDRESS";
    ConversationState["NEGOTIATING"] = "NEGOTIATING";
    ConversationState["CONFIRMING_ORDER"] = "CONFIRMING_ORDER";
    ConversationState["ORDER_PLACED"] = "ORDER_PLACED";
    ConversationState["TRACKING"] = "TRACKING";
    ConversationState["FOLLOWUP"] = "FOLLOWUP";
    ConversationState["CLOSED"] = "CLOSED";
})(ConversationState || (exports.ConversationState = ConversationState = {}));
// Order statuses
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["DRAFT"] = "DRAFT";
    OrderStatus["CONFIRMED"] = "CONFIRMED";
    OrderStatus["BOOKED"] = "BOOKED";
    OrderStatus["SHIPPED"] = "SHIPPED";
    OrderStatus["OUT_FOR_DELIVERY"] = "OUT_FOR_DELIVERY";
    OrderStatus["DELIVERED"] = "DELIVERED";
    OrderStatus["CANCELLED"] = "CANCELLED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
// Event statuses
var EventStatus;
(function (EventStatus) {
    EventStatus["PENDING"] = "PENDING";
    EventStatus["PROCESSING"] = "PROCESSING";
    EventStatus["COMPLETED"] = "COMPLETED";
    EventStatus["FAILED"] = "FAILED";
})(EventStatus || (exports.EventStatus = EventStatus = {}));
// DLQ statuses
var DlqStatus;
(function (DlqStatus) {
    DlqStatus["PENDING"] = "PENDING";
    DlqStatus["RETRYING"] = "RETRYING";
    DlqStatus["RESOLVED"] = "RESOLVED";
    DlqStatus["EXHAUSTED"] = "EXHAUSTED";
})(DlqStatus || (exports.DlqStatus = DlqStatus = {}));
// LLM Action types (allowlist)
var ActionType;
(function (ActionType) {
    ActionType["ASK_CLARIFYING_QUESTION"] = "ASK_CLARIFYING_QUESTION";
    ActionType["UPDATE_CART"] = "UPDATE_CART";
    ActionType["CREATE_ORDER"] = "CREATE_ORDER";
    ActionType["BOOK_DELIVERY"] = "BOOK_DELIVERY";
    ActionType["SEND_TRACKING"] = "SEND_TRACKING";
    ActionType["SCHEDULE_FOLLOWUP"] = "SCHEDULE_FOLLOWUP";
    ActionType["SEND_REPORT"] = "SEND_REPORT";
    ActionType["ESCALATE_TO_HUMAN"] = "ESCALATE_TO_HUMAN";
    ActionType["GREET"] = "GREET";
    ActionType["CONFIRM_ORDER"] = "CONFIRM_ORDER";
    ActionType["HANDLE_NEGOTIATION"] = "HANDLE_NEGOTIATION";
    ActionType["ORDER_CONFIRMED"] = "ORDER_CONFIRMED";
    ActionType["TRACK_ORDER"] = "TRACK_ORDER";
    ActionType["ESCALATE"] = "ESCALATE";
    ActionType["COLLECT_SLOTS"] = "COLLECT_SLOTS";
    ActionType["COUNTER_OFFER"] = "COUNTER_OFFER";
    ActionType["ACCEPT_NEGOTIATION"] = "ACCEPT_NEGOTIATION";
    ActionType["REJECT_NEGOTIATION"] = "REJECT_NEGOTIATION";
})(ActionType || (exports.ActionType = ActionType = {}));
// Message direction
var MessageDirection;
(function (MessageDirection) {
    MessageDirection["INBOUND"] = "inbound";
    MessageDirection["OUTBOUND"] = "outbound";
})(MessageDirection || (exports.MessageDirection = MessageDirection = {}));
// Slot types for slot filling
var SlotType;
(function (SlotType) {
    SlotType["PRODUCT"] = "product";
    SlotType["QUANTITY"] = "quantity";
    SlotType["SIZE"] = "size";
    SlotType["COLOR"] = "color";
    SlotType["OPTIONS"] = "options";
    SlotType["SUBSTITUTION_PREFERENCE"] = "substitution_preference";
    SlotType["CUSTOMER_NAME"] = "customer_name";
    SlotType["PHONE"] = "phone";
    SlotType["ADDRESS_CITY"] = "address_city";
    SlotType["ADDRESS_AREA"] = "address_area";
    SlotType["ADDRESS_STREET"] = "address_street";
    SlotType["ADDRESS_BUILDING"] = "address_building";
    SlotType["ADDRESS_FLOOR"] = "address_floor";
    SlotType["ADDRESS_APARTMENT"] = "address_apartment";
    SlotType["ADDRESS_LANDMARK"] = "address_landmark";
})(SlotType || (exports.SlotType = SlotType = {}));
