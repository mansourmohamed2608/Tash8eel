import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MerchantRepository } from './merchant.repository.impl';
import { ConversationRepository } from './conversation.repository.impl';
import { MessageRepository } from './message.repository.impl';
import { OrderRepository } from './order.repository.impl';
import { ShipmentRepository } from './shipment.repository.impl';
import { CustomerRepository } from './customer.repository.impl';
import { CatalogRepository } from './catalog.repository.impl';
import { KnownAreaRepository } from './known-area.repository.impl';
import { EventRepository } from './event.repository.impl';
import {
  MERCHANT_REPOSITORY,
  CONVERSATION_REPOSITORY,
  MESSAGE_REPOSITORY,
  ORDER_REPOSITORY,
  SHIPMENT_REPOSITORY,
  CUSTOMER_REPOSITORY,
  CATALOG_REPOSITORY,
  KNOWN_AREA_REPOSITORY,
  EVENT_REPOSITORY,
} from '../../domain/ports';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: MERCHANT_REPOSITORY, useClass: MerchantRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: MessageRepository },
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
    { provide: SHIPMENT_REPOSITORY, useClass: ShipmentRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: CustomerRepository },
    { provide: CATALOG_REPOSITORY, useClass: CatalogRepository },
    { provide: KNOWN_AREA_REPOSITORY, useClass: KnownAreaRepository },
    { provide: EVENT_REPOSITORY, useClass: EventRepository },
  ],
  exports: [
    MERCHANT_REPOSITORY,
    CONVERSATION_REPOSITORY,
    MESSAGE_REPOSITORY,
    ORDER_REPOSITORY,
    SHIPMENT_REPOSITORY,
    CUSTOMER_REPOSITORY,
    CATALOG_REPOSITORY,
    KNOWN_AREA_REPOSITORY,
    EVENT_REPOSITORY,
  ],
})
export class RepositoriesModule {}
