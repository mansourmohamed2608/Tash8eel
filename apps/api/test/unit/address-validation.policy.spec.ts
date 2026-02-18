import {
  AddressValidationPolicyFactory,
  CairoAddressValidator,
  GizaAddressValidator,
  AlexandriaAddressValidator,
  DefaultAddressValidator,
} from "../../src/application/policies/address-validation.policy";
import { ExtractedAddress } from "../../src/shared/schemas";
import { KnownArea } from "../../src/domain/entities/known-area.entity";

describe("AddressValidationPolicy", () => {
  // Create mock validators for testing without DI
  const cairoValidator = new CairoAddressValidator();
  const gizaValidator = new GizaAddressValidator();
  const alexandriaValidator = new AlexandriaAddressValidator();
  const defaultValidator = new DefaultAddressValidator();

  const factory = new AddressValidationPolicyFactory(
    cairoValidator,
    gizaValidator,
    alexandriaValidator,
    defaultValidator,
  );

  // Mock known areas for testing
  const cairoAreas: KnownArea[] = [
    {
      id: "1",
      city: "القاهرة",
      areaNameAr: "المعادي",
      areaNameEn: "Maadi",
      areaAliases: ["maadi", "معادي"],
      createdAt: new Date(),
    },
    {
      id: "2",
      city: "القاهرة",
      areaNameAr: "مدينة نصر",
      areaNameEn: "Nasr City",
      areaAliases: ["nasr city", "نصر"],
      createdAt: new Date(),
    },
    {
      id: "3",
      city: "القاهرة",
      areaNameAr: "مصر الجديدة",
      areaNameEn: "Heliopolis",
      areaAliases: ["heliopolis", "هليوبوليس"],
      createdAt: new Date(),
    },
    {
      id: "4",
      city: "القاهرة",
      areaNameAr: "التجمع الخامس",
      areaNameEn: "Fifth Settlement",
      areaAliases: ["التجمع", "5th settlement", "new cairo"],
      createdAt: new Date(),
    },
  ];

  const alexandriaAreas: KnownArea[] = [
    {
      id: "5",
      city: "الإسكندرية",
      areaNameAr: "سموحة",
      areaNameEn: "Smouha",
      areaAliases: ["smouha"],
      createdAt: new Date(),
    },
  ];

  const gizaAreas: KnownArea[] = [
    {
      id: "6",
      city: "الجيزة",
      areaNameAr: "الدقي",
      areaNameEn: "Dokki",
      areaAliases: ["dokki", "دقي"],
      createdAt: new Date(),
    },
    {
      id: "7",
      city: "الجيزة",
      areaNameAr: "المهندسين",
      areaNameEn: "Mohandessin",
      areaAliases: ["mohandessin", "مهندسين"],
      createdAt: new Date(),
    },
  ];

  describe("CairoAddressValidator", () => {
    it("should recognize Maadi with direct match", () => {
      const validator = factory.getValidator("cairo");
      const extracted: ExtractedAddress = {
        area: "المعادي",
        street: "شارع 9",
        raw_text: "شارع 9 المعادي",
      };
      const result = validator.validate(extracted, cairoAreas);
      expect(result.normalizedArea).toBe("المعادي");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should recognize Nasr City", () => {
      const validator = factory.getValidator("cairo");
      const extracted: ExtractedAddress = {
        area: "مدينة نصر",
        raw_text: "عمارة 5 مدينة نصر",
      };
      const result = validator.validate(extracted, cairoAreas);
      expect(result.normalizedArea).toBe("مدينة نصر");
    });

    it("should recognize transliterated area names", () => {
      const validator = factory.getValidator("cairo");
      const extracted: ExtractedAddress = {
        area: "Heliopolis",
        raw_text: "شارع الميرغني مصر الجديدة",
      };
      const result = validator.validate(extracted, cairoAreas);
      expect(result.normalizedArea).toBe("مصر الجديدة");
    });

    it("should handle alias match for التجمع", () => {
      const validator = factory.getValidator("cairo");
      const extracted: ExtractedAddress = {
        area: "التجمع",
        raw_text: "التجمع الخامس",
      };
      const result = validator.validate(extracted, cairoAreas);
      expect(result.normalizedArea).toBe("التجمع الخامس");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should return missing fields for incomplete address", () => {
      const validator = factory.getValidator("cairo");
      const extracted: ExtractedAddress = {
        raw_text: "عنوان غير واضح",
      };
      const result = validator.validate(extracted, cairoAreas);
      expect(result.missingFields.length).toBeGreaterThan(0);
      expect(result.isComplete).toBe(false);
    });
  });

  describe("AlexandriaAddressValidator", () => {
    it("should recognize Smouha", () => {
      const validator = factory.getValidator("alexandria");
      const extracted: ExtractedAddress = {
        area: "سموحة",
        street: "شارع فوزي معاذ",
        raw_text: "شارع فوزي معاذ سموحة",
      };
      const result = validator.validate(extracted, alexandriaAreas);
      expect(result.normalizedArea).toBe("سموحة");
    });

    it("should set city to Alexandria", () => {
      const validator = factory.getValidator("alexandria");
      const extracted: ExtractedAddress = {
        area: "سموحة",
        raw_text: "سموحة الإسكندرية",
      };
      const result = validator.validate(extracted, alexandriaAreas);
      expect(result.address.city).toBe("الإسكندرية");
    });
  });

  describe("GizaAddressValidator", () => {
    it("should recognize Dokki", () => {
      const validator = factory.getValidator("giza");
      const extracted: ExtractedAddress = {
        area: "الدقي",
        street: "شارع التحرير",
        raw_text: "شارع التحرير الدقي",
      };
      const result = validator.validate(extracted, gizaAreas);
      expect(result.normalizedArea).toBe("الدقي");
    });

    it("should recognize Mohandessin", () => {
      const validator = factory.getValidator("giza");
      const extracted: ExtractedAddress = {
        area: "المهندسين",
        street: "شارع شهاب",
        raw_text: "شارع شهاب المهندسين",
      };
      const result = validator.validate(extracted, gizaAreas);
      expect(result.normalizedArea).toBe("المهندسين");
    });
  });

  describe("Default Validator", () => {
    it("should accept addresses without known areas", () => {
      const validator = factory.getValidator("unknown_city");
      const extracted: ExtractedAddress = {
        area: "أي منطقة",
        street: "عنوان كامل",
        building: "10",
        raw_text: "أي منطقة - عنوان كامل - 10",
      };
      const result = validator.validate(extracted, []);
      // Should still return an address object
      expect(result.address).toBeDefined();
    });

    it("should mark address incomplete without minimum fields", () => {
      const validator = factory.getValidator("unknown_city");
      const extracted: ExtractedAddress = {
        raw_text: "",
      };
      const result = validator.validate(extracted, []);
      expect(result.isComplete).toBe(false);
    });
  });

  describe("AddressValidationPolicyFactory", () => {
    it("should return Cairo validator for cairo", () => {
      const validator = factory.getValidator("cairo");
      expect(validator).toBeInstanceOf(CairoAddressValidator);
    });

    it("should return Giza validator for giza", () => {
      const validator = factory.getValidator("giza");
      expect(validator).toBeInstanceOf(GizaAddressValidator);
    });

    it("should return Alexandria validator for alexandria", () => {
      const validator = factory.getValidator("alexandria");
      expect(validator).toBeInstanceOf(AlexandriaAddressValidator);
    });

    it("should return default validator for unknown city", () => {
      const validator = factory.getValidator("unknown");
      expect(validator).toBeInstanceOf(DefaultAddressValidator);
    });

    it("should return default validator when no city provided", () => {
      const validator = factory.getValidator();
      expect(validator).toBeInstanceOf(DefaultAddressValidator);
    });
  });
});
