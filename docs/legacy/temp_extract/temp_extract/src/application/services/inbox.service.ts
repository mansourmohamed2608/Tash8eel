import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { LlmService, LlmResult } from "../llm/llm.service";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import {
  MerchantCategory,
  ConversationState,
  ActionType,
  OrderStatus,
  MessageDirection,
} from "../../shared/constants/enums";
import {
  IDeliveryAdapter,
  DELIVERY_ADAPTER,
} from "../adapters/delivery-adapter.interface";

// Repository imports
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../domain/ports/conversation.repository";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from "../../domain/ports/message.repository";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../domain/ports/order.repository";
import {
  IShipmentRepository,
  SHIPMENT_REPOSITORY,
} from "../../domain/ports/shipment.repository";
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from "../../domain/ports/customer.repository";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import {
  IKnownAreaRepository,
  KNOWN_AREA_REPOSITORY,
} from "../../domain/ports/known-area.repository";

// Entity imports
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Customer } from "../../domain/entities/customer.entity";
import { Order } from "../../domain/entities/order.entity";

export interface InboxMessageParams {
  merchantId: string;
  senderId: string;
  text: string;
  correlationId?: string;
}

export interface InboxResponse {
  conversationId: string;
  replyText: string;
  action: ActionType;
  cart: any;
  orderId?: string;
  orderNumber?: string;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(SHIPMENT_REPOSITORY)
    private readonly shipmentRepo: IShipmentRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(KNOWN_AREA_REPOSITORY)
    private readonly knownAreaRepo: IKnownAreaRepository,
    @Inject(DELIVERY_ADAPTER)
    private readonly deliveryAdapter: IDeliveryAdapter,
    private readonly llmService: LlmService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Process incoming message - main orchestration method
   */
  async processMessage(params: InboxMessageParams): Promise<InboxResponse> {
    const correlationId = params.correlationId || uuidv4();
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
      throw new NotFoundException(`Merchant ${params.merchantId} not found`);
    }

    if (!merchant.isActive) {
      throw new BadRequestException(
        `Merchant ${params.merchantId} is not active`,
      );
    }

    // 2. Get or create conversation
    let conversation = await this.conversationRepo.findByMerchantAndSender(
      params.merchantId,
      params.senderId,
    );

    if (!conversation || conversation.state === ConversationState.CLOSED) {
      conversation = await this.createNewConversation(
        params.merchantId,
        params.senderId,
      );
    }

    // 3. Get or create customer
    let customer = await this.customerRepo.findByMerchantAndSender(
      params.merchantId,
      params.senderId,
    );
    if (!customer) {
      customer = await this.createNewCustomer(
        params.merchantId,
        params.senderId,
      );
    }

    // 4. Store incoming message
    await this.messageRepo.create({
      conversationId: conversation.id,
      merchantId: params.merchantId,
      senderId: params.senderId,
      direction: MessageDirection.INBOUND,
      text: params.text,
    });

    // 5. Publish MessageReceived event
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MESSAGE_RECEIVED,
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
    const recentMessages = await this.messageRepo.findByConversation(
      conversation.id,
    );

    // 7. Get LLM response
    const llmResponse = await this.llmService.processMessage({
      merchant,
      conversation,
      catalogItems,
      recentMessages: recentMessages.slice(-20),
      customerMessage: params.text,
    });

    // 8. Process LLM action
    const result = await this.processLlmAction(
      llmResponse,
      merchant,
      conversation,
      customer,
      correlationId,
    );

    // 9. Store bot reply
    await this.messageRepo.create({
      conversationId: conversation.id,
      merchantId: params.merchantId,
      senderId: "bot",
      direction: MessageDirection.OUTBOUND,
      text: result.replyText,
      tokensUsed: llmResponse.tokensUsed,
    });

    // 10. Update conversation with collected info and missing slots
    const collectedInfo = { ...conversation.collectedInfo };
    if (llmResponse.customerName)
      collectedInfo.customerName = llmResponse.customerName;
    if (llmResponse.phone) collectedInfo.phone = llmResponse.phone;
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
  private async processLlmAction(
    llmResponse: LlmResult,
    merchant: Merchant,
    conversation: Conversation,
    customer: Customer,
    correlationId: string,
  ): Promise<{
    replyText: string;
    action: ActionType;
    cart: any;
    orderId?: string;
    orderNumber?: string;
  }> {
    const action = llmResponse.action || ActionType.GREET;
    let cart = conversation.cart || {
      items: [],
      total: 0,
      subtotal: 0,
      discount: 0,
      deliveryFee: 0,
    };
    let orderId: string | undefined;
    let orderNumber: string | undefined;

    // Update cart if items extracted
    if (llmResponse.cartItems && llmResponse.cartItems.length > 0) {
      cart = await this.updateCart(cart, llmResponse.cartItems, merchant.id);
    }

    // Apply discount if negotiated
    if (llmResponse.discountPercent && llmResponse.discountPercent > 0) {
      const subtotal = cart.items.reduce(
        (sum: number, item: any) => sum + item.total,
        0,
      );
      const discountAmount = Math.round(
        subtotal * (llmResponse.discountPercent / 100),
      );
      cart.subtotal = subtotal;
      cart.discount = discountAmount;
      cart.total = subtotal - discountAmount + (cart.deliveryFee || 0);
    }

    // Apply delivery fee if specified
    if (llmResponse.deliveryFee && llmResponse.deliveryFee > 0) {
      cart.deliveryFee = llmResponse.deliveryFee;
      const subtotal =
        cart.subtotal ||
        cart.items.reduce((sum: number, item: any) => sum + item.total, 0);
      const discount = cart.discount || 0;
      cart.total = subtotal - discount + llmResponse.deliveryFee;
    }

    // Publish CartUpdated event if cart changed
    if (
      llmResponse.cartItems?.length ||
      llmResponse.discountPercent ||
      llmResponse.deliveryFee
    ) {
      await this.outboxService.publishEvent({
        eventType: EVENT_TYPES.CART_UPDATED,
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
      case ActionType.ORDER_CONFIRMED:
      case ActionType.CREATE_ORDER:
      case ActionType.CONFIRM_ORDER:
        const orderResult = await this.createOrder(
          merchant,
          conversation,
          customer,
          cart,
          llmResponse,
          correlationId,
        );
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
        break;

      case ActionType.ESCALATE:
      case ActionType.ESCALATE_TO_HUMAN:
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
  private async updateCart(
    currentCart: any,
    newItems: Array<{ name: string; quantity?: number }>,
    merchantId: string,
  ): Promise<{
    items: any[];
    total: number;
    subtotal?: number;
    discount?: number;
    deliveryFee?: number;
  }> {
    const items = [...(currentCart.items || [])];

    for (const newItem of newItems) {
      if (!newItem.name) continue;

      // Try to match with catalog using fuzzy search
      const catalogMatches = await this.catalogRepo.searchByName(
        merchantId,
        newItem.name,
      );
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
      const existingIndex = items.findIndex(
        (i: any) => i.productId === catalogItem.id,
      );

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
      } else {
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
    const filteredItems = items.filter(
      (i: any) => i.quantity > 0 && i.unitPrice > 0,
    );

    // Calculate subtotal (sum of all items)
    const subtotal = filteredItems.reduce(
      (sum: number, item: any) => sum + item.total,
      0,
    );

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
  private async createOrder(
    merchant: Merchant,
    conversation: Conversation,
    customer: Customer,
    cart: any,
    llmResponse: LlmResult,
    correlationId: string,
  ): Promise<{ orderId: string; orderNumber: string }> {
    const orderId = uuidv4();
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
      eventType: EVENT_TYPES.ORDER_CREATED,
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
  private async handleEscalation(
    merchant: Merchant,
    conversation: Conversation,
    correlationId: string,
  ): Promise<void> {
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MERCHANT_ALERTED,
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
  private async createNewConversation(
    merchantId: string,
    senderId: string,
  ): Promise<Conversation> {
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
    const updatedConversation = await this.conversationRepo.findById(
      conversation.id,
    );

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
  private async createNewCustomer(
    merchantId: string,
    senderId: string,
  ): Promise<Customer> {
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
  private determineNewState(
    action: ActionType,
    currentState: ConversationState,
  ): ConversationState {
    switch (action) {
      case ActionType.ORDER_CONFIRMED:
      case ActionType.CREATE_ORDER:
        return ConversationState.ORDER_PLACED;
      case ActionType.ESCALATE:
      case ActionType.ESCALATE_TO_HUMAN:
        return ConversationState.CLOSED;
      case ActionType.GREET:
        return ConversationState.GREETING;
      case ActionType.COLLECT_SLOTS:
      case ActionType.UPDATE_CART:
        return ConversationState.COLLECTING_ITEMS;
      case ActionType.COUNTER_OFFER:
      case ActionType.ACCEPT_NEGOTIATION:
      case ActionType.REJECT_NEGOTIATION:
      case ActionType.HANDLE_NEGOTIATION:
        return ConversationState.NEGOTIATING;
      default:
        return currentState;
    }
  }

  /**
   * Generate order number
   */
  private generateOrderNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${dateStr}-${random}`;
  }
}
