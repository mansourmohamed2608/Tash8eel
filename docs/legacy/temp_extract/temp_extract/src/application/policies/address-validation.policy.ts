import { Injectable } from "@nestjs/common";
import { Address, ExtractedAddress } from "../../shared/schemas";
import { KnownArea } from "../../domain/entities/known-area.entity";
import {
  IAddressValidationPolicy,
  AddressValidationResult,
} from "../../domain/policies/address-validation-policy.interface";
import { ARABIC_TEMPLATES } from "../../shared/constants/templates";

abstract class BaseAddressValidator implements IAddressValidationPolicy {
  abstract readonly city: string;

  validate(
    extracted: ExtractedAddress,
    knownAreas: KnownArea[],
  ): AddressValidationResult {
    const address: Address = {
      city: extracted.city || this.city,
      area: undefined,
      street: extracted.street,
      building: extracted.building,
      floor: extracted.floor,
      apartment: extracted.apartment,
      landmark: extracted.landmark,
      raw_text: extracted.raw_text,
      confidence: 0,
      missing_fields: [],
    };

    // Normalize area
    if (extracted.area) {
      const normalization = this.normalizeArea(extracted.area, knownAreas);
      if (normalization) {
        address.area = normalization.normalized;
        address.confidence = normalization.confidence;
      } else {
        address.area = extracted.area;
        address.confidence = 0.5;
      }
    }

    // Check missing fields
    const missingFields: string[] = [];

    if (!address.city) missingFields.push("city");
    if (!address.area) missingFields.push("area");
    if (!address.street) missingFields.push("street");
    if (!address.building) missingFields.push("building");

    address.missing_fields = missingFields;

    // Calculate overall confidence
    const filledFields = 4 - missingFields.length;
    address.confidence = Math.max(address.confidence, filledFields / 4);

    // Generate clarifying question for first missing field
    let clarifyingQuestion: string | undefined;
    if (missingFields.length > 0) {
      const firstMissing = missingFields[0];
      clarifyingQuestion = this.getQuestionForField(firstMissing);
    }

    return {
      address,
      missingFields,
      confidence: address.confidence,
      clarifyingQuestion,
      normalizedArea: address.area,
      isComplete: missingFields.length === 0,
    };
  }

  normalizeArea(
    areaName: string,
    knownAreas: KnownArea[],
  ): { normalized: string; confidence: number } | null {
    const normalized = areaName.trim();

    // Direct match
    const directMatch = knownAreas.find(
      (ka) =>
        ka.areaNameAr === normalized ||
        ka.areaNameEn?.toLowerCase() === normalized.toLowerCase(),
    );
    if (directMatch) {
      return { normalized: directMatch.areaNameAr, confidence: 1.0 };
    }

    // Alias match
    const aliasMatch = knownAreas.find((ka) =>
      ka.areaAliases.some(
        (alias) =>
          alias.toLowerCase() === normalized.toLowerCase() ||
          normalized.includes(alias),
      ),
    );
    if (aliasMatch) {
      return { normalized: aliasMatch.areaNameAr, confidence: 0.9 };
    }

    // Partial match
    const partialMatch = knownAreas.find(
      (ka) =>
        normalized.includes(ka.areaNameAr) ||
        ka.areaNameAr.includes(normalized),
    );
    if (partialMatch) {
      return { normalized: partialMatch.areaNameAr, confidence: 0.7 };
    }

    return null;
  }

  isKnownAreaName(text: string, knownAreas: KnownArea[]): boolean {
    const trimmed = text.trim();
    return knownAreas.some(
      (ka) =>
        ka.areaNameAr === trimmed ||
        ka.areaNameEn?.toLowerCase() === trimmed.toLowerCase() ||
        ka.areaAliases.some(
          (alias) => alias.toLowerCase() === trimmed.toLowerCase(),
        ),
    );
  }

  private getQuestionForField(field: string): string {
    const questions: Record<string, string> = {
      city: ARABIC_TEMPLATES.ASK_ADDRESS_CITY,
      area: ARABIC_TEMPLATES.ASK_ADDRESS_AREA,
      street: ARABIC_TEMPLATES.ASK_ADDRESS_STREET,
      building: ARABIC_TEMPLATES.ASK_ADDRESS_BUILDING,
      floor: ARABIC_TEMPLATES.ASK_ADDRESS_FLOOR,
      landmark: ARABIC_TEMPLATES.ASK_ADDRESS_LANDMARK,
    };
    return questions[field] || ARABIC_TEMPLATES.ASK_ADDRESS_AREA;
  }
}

@Injectable()
export class CairoAddressValidator extends BaseAddressValidator {
  readonly city = "القاهرة";
}

@Injectable()
export class GizaAddressValidator extends BaseAddressValidator {
  readonly city = "الجيزة";
}

@Injectable()
export class AlexandriaAddressValidator extends BaseAddressValidator {
  readonly city = "الإسكندرية";
}

@Injectable()
export class DefaultAddressValidator extends BaseAddressValidator {
  readonly city = "";
}

// Factory service
@Injectable()
export class AddressValidationPolicyFactory {
  private validators: Map<string, IAddressValidationPolicy>;
  private defaultValidator: IAddressValidationPolicy;

  constructor(
    cairoValidator: CairoAddressValidator,
    gizaValidator: GizaAddressValidator,
    alexandriaValidator: AlexandriaAddressValidator,
    defaultValidator: DefaultAddressValidator,
  ) {
    this.validators = new Map<string, IAddressValidationPolicy>();
    this.validators.set("القاهرة", cairoValidator);
    this.validators.set("الجيزة", gizaValidator);
    this.validators.set("الإسكندرية", alexandriaValidator);
    this.validators.set("cairo", cairoValidator);
    this.validators.set("giza", gizaValidator);
    this.validators.set("alexandria", alexandriaValidator);
    this.defaultValidator = defaultValidator;
  }

  getValidator(city?: string): IAddressValidationPolicy {
    if (!city) return this.defaultValidator;
    return (
      this.validators.get(city.toLowerCase()) ||
      this.validators.get(city) ||
      this.defaultValidator
    );
  }
}
