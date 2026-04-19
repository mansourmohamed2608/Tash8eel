import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsNumber,
  ValidateNested,
  Min,
  Max,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

// Custom validator to ensure text is not empty when no voice note is provided
function IsNotEmptyIfNoVoiceNote(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isNotEmptyIfNoVoiceNote",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          // If voice note is provided with mediaUrl, allow empty text
          if (obj.voiceNote?.mediaUrl) {
            return true;
          }
          // Otherwise, text must not be empty
          return typeof value === "string" && value.trim().length > 0;
        },
        defaultMessage(args: ValidationArguments) {
          return "Text cannot be empty when no voice note is provided";
        },
      },
    });
  };
}

export class VoiceNoteDto {
  @ApiPropertyOptional({
    description:
      "URL to the voice note audio file (e.g., from WhatsApp media URL)",
    example: "https://example.com/media/audio.ogg",
  })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({
    description: "MIME type of the audio",
    example: "audio/ogg",
  })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({
    description: "Duration in seconds",
    example: 5.5,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(300) // Max 5 minutes
  duration?: number;
}

export class InboxMessageDto {
  @ApiProperty({
    description: "Merchant ID",
    example: "merchant-123",
  })
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @ApiProperty({
    description: "Customer/sender ID (e.g., WhatsApp number)",
    example: "+201234567890",
  })
  @IsString()
  @IsNotEmpty()
  senderId!: string;

  @ApiProperty({
    description:
      "Message text from customer (can be empty if voice note is provided)",
    example: "عايز 2 تيشيرت أبيض مقاس لارج",
  })
  @IsString()
  @MaxLength(4000)
  @IsNotEmptyIfNoVoiceNote({
    message: "Text cannot be empty when no voice note is provided",
  })
  text!: string;

  @ApiPropertyOptional({
    description:
      "Voice note parameters - if provided, will be transcribed to text",
    type: VoiceNoteDto,
  })
  @ValidateNested()
  @Type(() => VoiceNoteDto)
  @IsOptional()
  voiceNote?: VoiceNoteDto;

  @ApiPropertyOptional({
    description: "Correlation ID for tracing",
    example: "corr-abc-123",
  })
  @IsString()
  @IsOptional()
  correlationId?: string;
}

export class TranscriptionResultDto {
  @ApiProperty({ description: "Transcribed text" })
  text!: string;

  @ApiProperty({ description: "Confidence score (0-1)" })
  confidence!: number;

  @ApiProperty({ description: "Audio duration in seconds" })
  duration!: number;

  @ApiProperty({ description: "Detected language code" })
  language!: string;
}

export class InboxResponseDto {
  @ApiProperty({ description: "Conversation ID" })
  conversationId!: string;

  @ApiProperty({ description: "Bot reply text in Arabic" })
  replyText!: string;

  @ApiPropertyOptional({
    description: "Optional media attachments selected for this reply",
    example: [
      {
        url: "https://example.com/product.jpg",
        caption: "صورة المنتج",
        fallbackText: "الصورة غير متاحة حالياً",
      },
    ],
  })
  mediaAttachments?: Array<{
    url: string;
    caption?: string;
    fallbackText?: string;
  }>;

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
  action!: string;

  @ApiProperty({
    description: "Current cart state",
    example: {
      items: [{ name: "تيشيرت أبيض", quantity: 2, unitPrice: 150, total: 300 }],
      total: 300,
    },
  })
  cart!: any;

  @ApiPropertyOptional({ description: "Order ID if order was created" })
  orderId?: string;

  @ApiPropertyOptional({ description: "Order number if order was created" })
  orderNumber?: string;

  @ApiPropertyOptional({
    description: "Transcription result if voice note was processed",
    type: TranscriptionResultDto,
  })
  transcription?: TranscriptionResultDto;
}
