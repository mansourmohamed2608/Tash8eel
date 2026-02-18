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
  ],
  exports: [
    DELIVERY_ADAPTER,
    TRANSCRIPTION_ADAPTER,
    TranscriptionAdapterFactory,
    META_WHATSAPP_ADAPTER,
    MetaWhatsAppAdapter,
  ],
})
export class AdaptersModule {}
