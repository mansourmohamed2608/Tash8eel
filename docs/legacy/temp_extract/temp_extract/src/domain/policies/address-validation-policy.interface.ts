import { Address, ExtractedAddress } from "../../shared/schemas";
import { KnownArea } from "../entities/known-area.entity";

export interface AddressValidationResult {
  address: Address;
  missingFields: string[];
  confidence: number;
  clarifyingQuestion?: string;
  normalizedArea?: string;
  isComplete: boolean;
}

export interface IAddressValidationPolicy {
  readonly city: string;

  validate(
    extracted: ExtractedAddress,
    knownAreas: KnownArea[],
  ): AddressValidationResult;

  normalizeArea(
    areaName: string,
    knownAreas: KnownArea[],
  ): { normalized: string; confidence: number } | null;

  isKnownAreaName(text: string, knownAreas: KnownArea[]): boolean;
}

export const ADDRESS_VALIDATION_POLICY = Symbol("IAddressValidationPolicy");
