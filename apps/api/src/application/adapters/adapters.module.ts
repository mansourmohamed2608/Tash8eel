import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DisabledDeliveryAdapter } from "./disabled-delivery.adapter";
import { DELIVERY_ADAPTER } from "./delivery-adapter.interface";
import {
  MockTranscriptionAdapter,
  WhisperTranscriptionAdapter,
  TranscriptionAdapterFactory,
  TRANSCRIPTION_ADAPTER,
} from "./transcription.adapter";
import {
  MetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
} from "./meta-whatsapp.adapter";
import { MessengerAdapter, META_MESSENGER_ADAPTER } from "./messenger.adapter";
import { InstagramAdapter, META_INSTAGRAM_ADAPTER } from "./instagram.adapter";
import { DatabaseModule } from "../../infrastructure/database/database.module";

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    // Delivery adapter
    {
      provide: DELIVERY_ADAPTER,
      useClass: DisabledDeliveryAdapter,
    },
    // Transcription adapters
    MockTranscriptionAdapter,
    WhisperTranscriptionAdapter,
    TranscriptionAdapterFactory,
    {
      provide: TRANSCRIPTION_ADAPTER,
      useFactory: (factory: TranscriptionAdapterFactory) => {
        return factory.getAdapter();
      },
      inject: [TranscriptionAdapterFactory],
    },
    // Meta WhatsApp adapter (replaces Twilio)
    MetaWhatsAppAdapter,
    {
      provide: META_WHATSAPP_ADAPTER,
      useFactory: (realAdapter: MetaWhatsAppAdapter) => realAdapter,
      inject: [MetaWhatsAppAdapter],
    },
    MessengerAdapter,
    {
      provide: META_MESSENGER_ADAPTER,
      useFactory: (realAdapter: MessengerAdapter) => realAdapter,
      inject: [MessengerAdapter],
    },
    InstagramAdapter,
    {
      provide: META_INSTAGRAM_ADAPTER,
      useFactory: (realAdapter: InstagramAdapter) => realAdapter,
      inject: [InstagramAdapter],
    },
  ],
  exports: [
    DELIVERY_ADAPTER,
    TRANSCRIPTION_ADAPTER,
    TranscriptionAdapterFactory,
    META_WHATSAPP_ADAPTER,
    MetaWhatsAppAdapter,
    META_MESSENGER_ADAPTER,
    MessengerAdapter,
    META_INSTAGRAM_ADAPTER,
    InstagramAdapter,
  ],
})
export class AdaptersModule {}
