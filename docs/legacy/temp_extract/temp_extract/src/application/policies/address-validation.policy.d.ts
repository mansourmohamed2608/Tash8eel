import { ExtractedAddress } from "../../shared/schemas";
import { KnownArea } from "../../domain/entities/known-area.entity";
import { IAddressValidationPolicy, AddressValidationResult } from "../../domain/policies/address-validation-policy.interface";
declare abstract class BaseAddressValidator implements IAddressValidationPolicy {
    abstract readonly city: string;
    validate(extracted: ExtractedAddress, knownAreas: KnownArea[]): AddressValidationResult;
    normalizeArea(areaName: string, knownAreas: KnownArea[]): {
        normalized: string;
        confidence: number;
    } | null;
    isKnownAreaName(text: string, knownAreas: KnownArea[]): boolean;
    private getQuestionForField;
}
export declare class CairoAddressValidator extends BaseAddressValidator {
    readonly city = "\u0627\u0644\u0642\u0627\u0647\u0631\u0629";
}
export declare class GizaAddressValidator extends BaseAddressValidator {
    readonly city = "\u0627\u0644\u062C\u064A\u0632\u0629";
}
export declare class AlexandriaAddressValidator extends BaseAddressValidator {
    readonly city = "\u0627\u0644\u0625\u0633\u0643\u0646\u062F\u0631\u064A\u0629";
}
export declare class DefaultAddressValidator extends BaseAddressValidator {
    readonly city = "";
}
export declare class AddressValidationPolicyFactory {
    private validators;
    private defaultValidator;
    constructor(cairoValidator: CairoAddressValidator, gizaValidator: GizaAddressValidator, alexandriaValidator: AlexandriaAddressValidator, defaultValidator: DefaultAddressValidator);
    getValidator(city?: string): IAddressValidationPolicy;
}
export {};
