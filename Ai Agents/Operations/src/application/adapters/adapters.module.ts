import { Module } from '@nestjs/common';
import { MockDeliveryAdapter } from './mock-delivery.adapter';
import { DELIVERY_ADAPTER } from './delivery-adapter.interface';

@Module({
  providers: [
    {
      provide: DELIVERY_ADAPTER,
      useClass: MockDeliveryAdapter,
    },
  ],
  exports: [DELIVERY_ADAPTER],
})
export class AdaptersModule {}
