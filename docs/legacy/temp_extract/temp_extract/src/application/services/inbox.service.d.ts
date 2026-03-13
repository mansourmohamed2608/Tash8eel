import { Pool } from "pg";
import { LlmService } from "../llm/llm.service";
import { OutboxService } from "../events/outbox.service";
import { ActionType } from "../../shared/constants/enums";
import { IDeliveryAdapter } from "../adapters/delivery-adapter.interface";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
import { IConversationRepository } from "../../domain/ports/conversation.repository";
import { IMessageRepository } from "../../domain/ports/message.repository";
import { IOrderRepository } from "../../domain/ports/order.repository";
import { IShipmentRepository } from "../../domain/ports/shipment.repository";
import { ICustomerRepository } from "../../domain/ports/customer.repository";
import { ICatalogRepository } from "../../domain/ports/catalog.repository";
import { IKnownAreaRepository } from "../../domain/ports/known-area.repository";
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
export declare class InboxService {
    private readonly pool;
    private readonly merchantRepo;
    private readonly conversationRepo;
    private readonly messageRepo;
    private readonly orderRepo;
    private readonly shipmentRepo;
    private readonly customerRepo;
    private readonly catalogRepo;
    private readonly knownAreaRepo;
    private readonly deliveryAdapter;
    private readonly llmService;
    private readonly outboxService;
    private readonly logger;
    constructor(pool: Pool, merchantRepo: IMerchantRepository, conversationRepo: IConversationRepository, messageRepo: IMessageRepository, orderRepo: IOrderRepository, shipmentRepo: IShipmentRepository, customerRepo: ICustomerRepository, catalogRepo: ICatalogRepository, knownAreaRepo: IKnownAreaRepository, deliveryAdapter: IDeliveryAdapter, llmService: LlmService, outboxService: OutboxService);
    /**
     * Process incoming message - main orchestration method
     */
    processMessage(params: InboxMessageParams): Promise<InboxResponse>;
    /**
     * Process LLM action and update state
     */
    private processLlmAction;
    /**
     * Update cart with new items
     */
    private updateCart;
    /**
     * Create order from confirmed cart
     */
    private createOrder;
    /**
     * Handle escalation to human
     */
    private handleEscalation;
    /**
     * Create new conversation
     */
    private createNewConversation;
    /**
     * Create new customer
     */
    private createNewCustomer;
    /**
     * Determine new conversation state based on action
     */
    private determineNewState;
    /**
     * Generate order number
     */
    private generateOrderNumber;
}
