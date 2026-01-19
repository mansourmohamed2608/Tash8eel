import { Module } from '@nestjs/common';
import {
  ClothesNegotiationPolicy,
  FoodNegotiationPolicy,
  SupermarketNegotiationPolicy,
  GenericNegotiationPolicy,
  NegotiationPolicyFactory,
} from './negotiation.policy';
import {
  ClothesSlotFillingPolicy,
  FoodSlotFillingPolicy,
  SupermarketSlotFillingPolicy,
  GenericSlotFillingPolicy,
  SlotFillingPolicyFactory,
} from './slot-filling.policy';
import {
  CairoAddressValidator,
  GizaAddressValidator,
  AlexandriaAddressValidator,
  DefaultAddressValidator,
  AddressValidationPolicyFactory,
} from './address-validation.policy';

@Module({
  providers: [
    // Negotiation policies
    ClothesNegotiationPolicy,
    FoodNegotiationPolicy,
    SupermarketNegotiationPolicy,
    GenericNegotiationPolicy,
    NegotiationPolicyFactory,
    // Slot filling policies
    ClothesSlotFillingPolicy,
    FoodSlotFillingPolicy,
    SupermarketSlotFillingPolicy,
    GenericSlotFillingPolicy,
    SlotFillingPolicyFactory,
    // Address validators
    CairoAddressValidator,
    GizaAddressValidator,
    AlexandriaAddressValidator,
    DefaultAddressValidator,
    AddressValidationPolicyFactory,
  ],
  exports: [
    NegotiationPolicyFactory,
    SlotFillingPolicyFactory,
    AddressValidationPolicyFactory,
  ],
})
export class PoliciesModule {}
