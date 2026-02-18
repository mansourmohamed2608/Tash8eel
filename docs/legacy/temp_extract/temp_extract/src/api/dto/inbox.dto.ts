import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InboxMessageDto {
  @ApiProperty({
    description: "Merchant ID",
    example: "merchant-123",
  })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({
    description: "Customer/sender ID (e.g., WhatsApp number)",
    example: "+201234567890",
  })
  @IsString()
  @IsNotEmpty()
  senderId: string;

  @ApiProperty({
    description: "Message text from customer",
    example: "عايز 2 تيشيرت أبيض مقاس لارج",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;

  @ApiPropertyOptional({
    description: "Correlation ID for tracing",
    example: "corr-abc-123",
  })
  @IsString()
  @IsOptional()
  correlationId?: string;
}

export class InboxResponseDto {
  @ApiProperty({ description: "Conversation ID" })
  conversationId: string;

  @ApiProperty({ description: "Bot reply text in Arabic" })
  replyText: string;

  @ApiProperty({
    description: "Action taken by the bot",
    enum: [
      "greet",
      "update_cart",
      "collect_slots",
      "counter_offer",
      "accept_negotiation",
      "reject_negotiation",
      "order_confirmed",
      "track_order",
      "escalate",
      "fallback",
    ],
  })
  action: string;

  @ApiProperty({
    description: "Current cart state",
    example: {
      items: [{ name: "تيشيرت أبيض", quantity: 2, unitPrice: 150, total: 300 }],
      total: 300,
    },
  })
  cart: any;

  @ApiPropertyOptional({ description: "Order ID if order was created" })
  orderId?: string;

  @ApiPropertyOptional({ description: "Order number if order was created" })
  orderNumber?: string;
}
