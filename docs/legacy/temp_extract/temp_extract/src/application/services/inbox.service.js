"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const event_types_1 = require("../events/event-types");
const enums_1 = require("../../shared/constants/enums");
let InboxService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var InboxService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            InboxService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        merchantRepo;
        conversationRepo;
        messageRepo;
        orderRepo;
        shipmentRepo;
        customerRepo;
        catalogRepo;
        knownAreaRepo;
        deliveryAdapter;
        llmService;
        outboxService;
        logger = new common_1.Logger(InboxService.name);
        constructor(pool, merchantRepo, conversationRepo, messageRepo, orderRepo, shipmentRepo, customerRepo, catalogRepo, knownAreaRepo, deliveryAdapter, llmService, outboxService) {
            this.pool = pool;
            this.merchantRepo = merchantRepo;
            this.conversationRepo = conversationRepo;
            this.messageRepo = messageRepo;
            this.orderRepo = orderRepo;
            this.shipmentRepo = shipmentRepo;
            this.customerRepo = customerRepo;
            this.catalogRepo = catalogRepo;
            this.knownAreaRepo = knownAreaRepo;
            this.deliveryAdapter = deliveryAdapter;
            this.llmService = llmService;
            this.outboxService = outboxService;
        }
        /**
         * Process incoming message - main orchestration method
         */
        async processMessage(params) {
            const correlationId = params.correlationId || (0, uuid_1.v4)();
            const startTime = Date.now();
            this.logger.log({
                message: "Processing incoming message",
                merchantId: params.merchantId,
                senderId: params.senderId,
                correlationId,
            });
            // 1. Load merchant
            const merchant = await this.merchantRepo.findById(params.merchantId);
            if (!merchant) {
                throw new common_1.NotFoundException(`Merchant ${params.merchantId} not found`);
            }
            if (!merchant.isActive) {
                throw new common_1.BadRequestException(`Merchant ${params.merchantId} is not active`);
            }
            // 2. Get or create conversation
            let conversation = await this.conversationRepo.findByMerchantAndSender(params.merchantId, params.senderId);
            if (!conversation || conversation.state === enums_1.ConversationState.CLOSED) {
                conversation = await this.createNewConversation(params.merchantId, params.senderId);
            }
            // 3. Get or create customer
            let customer = await this.customerRepo.findByMerchantAndSender(params.merchantId, params.senderId);
            if (!customer) {
                customer = await this.createNewCustomer(params.merchantId, params.senderId);
            }
            // 4. Store incoming message
            await this.messageRepo.create({
                conversationId: conversation.id,
                merchantId: params.merchantId,
                senderId: params.senderId,
                direction: enums_1.MessageDirection.INBOUND,
                text: params.text,
            });
            // 5. Publish MessageReceived event
            await this.outboxService.publishEvent({
                eventType: event_types_1.EVENT_TYPES.MESSAGE_RECEIVED,
                aggregateType: "conversation",
                aggregateId: conversation.id,
                merchantId: params.merchantId,
                correlationId,
                payload: {
                    conversationId: conversation.id,
                    merchantId: params.merchantId,
                    senderId: params.senderId,
                    text: params.text,
                },
            });
            // 6. Get catalog items and recent messages
            const catalogItems = await this.catalogRepo.findByMerchant(merchant.id);
            const recentMessages = await this.messageRepo.findByConversation(conversation.id);
            // 7. Get LLM response
            const llmResponse = await this.llmService.processMessage({
                merchant,
                conversation,
                catalogItems,
                recentMessages: recentMessages.slice(-20),
                customerMessage: params.text,
            });
            // 8. Process LLM action
            const result = await this.processLlmAction(llmResponse, merchant, conversation, customer, correlationId);
            // 9. Store bot reply
            await this.messageRepo.create({
                conversationId: conversation.id,
                merchantId: params.merchantId,
                senderId: "bot",
                direction: enums_1.MessageDirection.OUTBOUND,
                text: result.replyText,
                tokensUsed: llmResponse.tokensUsed,
            });
            // 10. Update conversation with collected info and missing slots
            const collectedInfo = { ...conversation.collectedInfo };
            if (llmResponse.customerName)
                collectedInfo.customerName = llmResponse.customerName;
            if (llmResponse.phone)
                collectedInfo.phone = llmResponse.phone;
            if (llmResponse.address)
                collectedInfo.address = { raw_text: llmResponse.address };
            await this.conversationRepo.update(conversation.id, {
                cart: result.cart,
                state: this.determineNewState(result.action, conversation.state),
                lastMessageAt: new Date(),
                collectedInfo,
                missingSlots: llmResponse.missingSlots || [],
            });
            const processingTime = Date.now() - startTime;
            this.logger.log({
                message: "Message processed",
                conversationId: conversation.id,
                action: result.action,
                processingTimeMs: processingTime,
                tokensUsed: llmResponse.tokensUsed,
                correlationId,
            });
            return {
                conversationId: conversation.id,
                replyText: result.replyText,
                action: result.action,
                cart: result.cart,
                orderId: result.orderId,
                orderNumber: result.orderNumber,
            };
        }
        /**
         * Process LLM action and update state
         */
        async processLlmAction(llmResponse, merchant, conversation, customer, correlationId) {
            const action = llmResponse.action || enums_1.ActionType.GREET;
            let cart = conversation.cart || {
                items: [],
                total: 0,
                subtotal: 0,
                discount: 0,
                deliveryFee: 0,
            };
            let orderId;
            let orderNumber;
            // Update cart if items extracted
            if (llmResponse.cartItems && llmResponse.cartItems.length > 0) {
                cart = await this.updateCart(cart, llmResponse.cartItems, merchant.id);
            }
            // Apply discount if negotiated
            if (llmResponse.discountPercent && llmResponse.discountPercent > 0) {
                const subtotal = cart.items.reduce((sum, item) => sum + item.total, 0);
                const discountAmount = Math.round(subtotal * (llmResponse.discountPercent / 100));
                cart.subtotal = subtotal;
                cart.discount = discountAmount;
                cart.total = subtotal - discountAmount + (cart.deliveryFee || 0);
            }
            // Apply delivery fee if specified
            if (llmResponse.deliveryFee && llmResponse.deliveryFee > 0) {
                cart.deliveryFee = llmResponse.deliveryFee;
                const subtotal = cart.subtotal ||
                    cart.items.reduce((sum, item) => sum + item.total, 0);
                const discount = cart.discount || 0;
                cart.total = subtotal - discount + llmResponse.deliveryFee;
            }
            // Publish CartUpdated event if cart changed
            if (llmResponse.cartItems?.length ||
                llmResponse.discountPercent ||
                llmResponse.deliveryFee) {
                await this.outboxService.publishEvent({
                    eventType: event_types_1.EVENT_TYPES.CART_UPDATED,
                    aggregateType: "conversation",
                    aggregateId: conversation.id,
                    merchantId: merchant.id,
                    correlationId,
                    payload: {
                        conversationId: conversation.id,
                        merchantId: merchant.id,
                        items: cart.items,
                        total: cart.total,
                        subtotal: cart.subtotal,
                        discount: cart.discount,
                        deliveryFee: cart.deliveryFee,
                    },
                });
            }
            // Process specific actions
            switch (action) {
                case enums_1.ActionType.ORDER_CONFIRMED:
                case enums_1.ActionType.CREATE_ORDER:
                case enums_1.ActionType.CONFIRM_ORDER:
                    const orderResult = await this.createOrder(merchant, conversation, customer, cart, llmResponse, correlationId);
                    orderId = orderResult.orderId;
                    orderNumber = orderResult.orderNumber;
                    break;
                case enums_1.ActionType.ESCALATE:
                case enums_1.ActionType.ESCALATE_TO_HUMAN:
                    await this.handleEscalation(merchant, conversation, correlationId);
                    break;
            }
            return {
                replyText: llmResponse.reply || llmResponse.response.reply_ar,
                action,
                cart,
                orderId,
                orderNumber,
            };
        }
        /**
         * Update cart with new items
         */
        async updateCart(currentCart, newItems, merchantId) {
            const items = [...(currentCart.items || [])];
            for (const newItem of newItems) {
                if (!newItem.name)
                    continue;
                // Try to match with catalog using fuzzy search
                const catalogMatches = await this.catalogRepo.searchByName(merchantId, newItem.name);
                const catalogItem = catalogMatches[0];
                // Skip items that don't match catalog
                if (!catalogItem) {
                    this.logger.warn({
                        msg: "Product not found in catalog - skipping",
                        searchTerm: newItem.name,
                        merchantId,
                    });
                    continue;
                }
                const itemPrice = catalogItem.basePrice;
                if (!itemPrice || itemPrice <= 0) {
                    this.logger.warn({
                        msg: "Product has no price - skipping",
                        productName: catalogItem.nameAr,
                        merchantId,
                    });
                    continue;
                }
                const quantity = newItem.quantity || 1;
                const productName = catalogItem.nameAr; // Use catalog name, not LLM name
                // Check if item already in cart by productId
                const existingIndex = items.findIndex((i) => i.productId === catalogItem.id);
                if (existingIndex >= 0) {
                    // Item already in cart - DON'T add quantity again (LLM might just be confirming)
                    // Only update if the new quantity is different and explicitly set
                    // Keep existing quantity unless LLM explicitly changes it
                    this.logger.debug({
                        msg: "Item already in cart - keeping existing quantity",
                        productName,
                        existingQuantity: items[existingIndex].quantity,
                        llmQuantity: quantity,
                    });
                    // Just ensure price is correct
                    items[existingIndex].unitPrice = itemPrice;
                    items[existingIndex].total = items[existingIndex].quantity * itemPrice;
                }
                else {
                    // Add new item
                    items.push({
                        productId: catalogItem.id,
                        name: productName,
                        quantity,
                        unitPrice: itemPrice,
                        total: quantity * itemPrice,
                    });
                }
            }
            // Remove items with 0 quantity or 0 price
            const filteredItems = items.filter((i) => i.quantity > 0 && i.unitPrice > 0);
            // Calculate subtotal (sum of all items)
            const subtotal = filteredItems.reduce((sum, item) => sum + item.total, 0);
            return {
                items: filteredItems,
                total: subtotal,
                subtotal,
                discount: currentCart.discount || 0,
                deliveryFee: currentCart.deliveryFee || 0,
            };
        }
        /**
         * Create order from confirmed cart
         */
        async createOrder(merchant, conversation, customer, cart, llmResponse, correlationId) {
            const orderId = (0, uuid_1.v4)();
            const orderNumber = this.generateOrderNumber();
            // Update customer with extracted info
            if (llmResponse.customerName || llmResponse.address || llmResponse.phone) {
                const addressObj = llmResponse.address
                    ? { raw_text: llmResponse.address }
                    : undefined;
                await this.customerRepo.update(customer.id, {
                    name: llmResponse.customerName || customer.name,
                    phone: llmResponse.phone || customer.phone,
                    address: addressObj,
                });
            }
            const deliveryFee = merchant.defaultDeliveryFee || 30;
            const deliveryAddr = llmResponse.address
                ? { raw_text: llmResponse.address }
                : customer.address;
            // Create order
            await this.orderRepo.create({
                merchantId: merchant.id,
                conversationId: conversation.id,
                customerId: customer.id,
                orderNumber,
                items: cart.items,
                subtotal: cart.total,
                deliveryFee,
                discount: 0,
                total: cart.total + deliveryFee,
                customerName: llmResponse.customerName || customer.name || "Customer",
                customerPhone: llmResponse.phone || customer.phone || "",
                deliveryAddress: deliveryAddr,
            });
            // Publish OrderCreated event
            await this.outboxService.publishEvent({
                eventType: event_types_1.EVENT_TYPES.ORDER_CREATED,
                aggregateType: "order",
                aggregateId: orderId,
                merchantId: merchant.id,
                correlationId,
                payload: {
                    orderId,
                    orderNumber,
                    merchantId: merchant.id,
                    conversationId: conversation.id,
                    customerId: customer.id,
                    total: cart.total + deliveryFee,
                },
            });
            this.logger.log({
                message: "Order created",
                orderId,
                orderNumber,
                merchantId: merchant.id,
                total: cart.total + deliveryFee,
            });
            return { orderId, orderNumber };
        }
        /**
         * Handle escalation to human
         */
        async handleEscalation(merchant, conversation, correlationId) {
            await this.outboxService.publishEvent({
                eventType: event_types_1.EVENT_TYPES.MERCHANT_ALERTED,
                aggregateType: "merchant",
                aggregateId: merchant.id,
                merchantId: merchant.id,
                correlationId,
                payload: {
                    merchantId: merchant.id,
                    alertType: "escalation_needed",
                    message: "العميل يطلب التحدث مع شخص حقيقي",
                    metadata: {
                        conversationId: conversation.id,
                    },
                },
            });
            this.logger.warn({
                message: "Conversation escalated to human",
                conversationId: conversation.id,
                merchantId: merchant.id,
            });
        }
        /**
         * Create new conversation
         */
        async createNewConversation(merchantId, senderId) {
            const conversation = await this.conversationRepo.create({
                merchantId,
                senderId,
            });
            // Set phone from senderId (WhatsApp number) by default
            await this.conversationRepo.update(conversation.id, {
                collectedInfo: {
                    phone: senderId,
                },
            });
            // Refetch to get updated collectedInfo
            const updatedConversation = await this.conversationRepo.findById(conversation.id);
            this.logger.log({
                message: "New conversation created",
                conversationId: conversation.id,
                merchantId,
                senderId,
                phoneAutoSet: senderId,
            });
            return updatedConversation || conversation;
        }
        /**
         * Create new customer
         */
        async createNewCustomer(merchantId, senderId) {
            const customer = await this.customerRepo.create({
                merchantId,
                senderId,
            });
            this.logger.log({
                message: "New customer created",
                customerId: customer.id,
                merchantId,
                senderId,
            });
            return customer;
        }
        /**
         * Determine new conversation state based on action
         */
        determineNewState(action, currentState) {
            switch (action) {
                case enums_1.ActionType.ORDER_CONFIRMED:
                case enums_1.ActionType.CREATE_ORDER:
                    return enums_1.ConversationState.ORDER_PLACED;
                case enums_1.ActionType.ESCALATE:
                case enums_1.ActionType.ESCALATE_TO_HUMAN:
                    return enums_1.ConversationState.CLOSED;
                case enums_1.ActionType.GREET:
                    return enums_1.ConversationState.GREETING;
                case enums_1.ActionType.COLLECT_SLOTS:
                case enums_1.ActionType.UPDATE_CART:
                    return enums_1.ConversationState.COLLECTING_ITEMS;
                case enums_1.ActionType.COUNTER_OFFER:
                case enums_1.ActionType.ACCEPT_NEGOTIATION:
                case enums_1.ActionType.REJECT_NEGOTIATION:
                case enums_1.ActionType.HANDLE_NEGOTIATION:
                    return enums_1.ConversationState.NEGOTIATING;
                default:
                    return currentState;
            }
        }
        /**
         * Generate order number
         */
        generateOrderNumber() {
            const date = new Date();
            const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            return `ORD-${dateStr}-${random}`;
        }
    };
    return InboxService = _classThis;
})();
exports.InboxService = InboxService;
