export declare class InboxMessageDto {
    merchantId: string;
    senderId: string;
    text: string;
    correlationId?: string;
}
export declare class InboxResponseDto {
    conversationId: string;
    replyText: string;
    action: string;
    cart: any;
    orderId?: string;
    orderNumber?: string;
}
