"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const address_depth_service_1 = require("../../src/application/services/address-depth.service");
const address_validation_policy_1 = require("../../src/application/policies/address-validation.policy");
describe("AddressDepthService", () => {
    let service;
    let factory;
    beforeEach(() => {
        const defaultValidator = new address_validation_policy_1.DefaultAddressValidator();
        const cairoValidator = new address_validation_policy_1.CairoAddressValidator();
        factory = new address_validation_policy_1.AddressValidationPolicyFactory(cairoValidator, {}, // GizaValidator
        {}, // AlexandriaValidator
        defaultValidator);
        service = new address_depth_service_1.AddressDepthService(factory);
    });
    describe("analyzeDepth", () => {
        it("should return city level for minimal address", () => {
            const result = service.analyzeDepth({ city: "القاهرة" });
            expect(result.level).toBe("city");
            expect(result.score).toBe(20);
            expect(result.missingFields).toContain("area");
        });
        it("should return area level with area provided", () => {
            const result = service.analyzeDepth({
                city: "القاهرة",
                area: "المعادي",
            });
            expect(result.level).toBe("area");
            expect(result.score).toBe(40);
            expect(result.missingFields).toContain("street");
        });
        it("should return street level with street provided", () => {
            const result = service.analyzeDepth({
                city: "القاهرة",
                area: "المعادي",
                street: "شارع 9",
            });
            expect(result.level).toBe("street");
            expect(result.score).toBe(60);
        });
        it("should return building level with building provided", () => {
            const result = service.analyzeDepth({
                city: "القاهرة",
                area: "المعادي",
                street: "شارع 9",
                building: "عمارة 5",
            });
            expect(result.level).toBe("building");
            expect(result.score).toBe(80);
        });
        it("should return full level with complete address", () => {
            const result = service.analyzeDepth({
                city: "القاهرة",
                area: "المعادي",
                street: "شارع 9",
                building: "عمارة 5",
                floor: "3",
                apartment: "12",
            });
            expect(result.level).toBe("full");
            expect(result.score).toBe(100);
        });
        it("should generate suggestions for missing fields", () => {
            const result = service.analyzeDepth({ city: "القاهرة" });
            expect(result.suggestions.length).toBeGreaterThan(0);
            expect(result.suggestions[0]).toContain("المنطقة");
        });
    });
    describe("parseGoogleMapsUrl", () => {
        it("should parse @lat,lng format", () => {
            const url = "https://www.google.com/maps/@30.0444,31.2357,17z";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
            expect(result?.lng).toBeCloseTo(31.2357);
        });
        it("should parse q=lat,lng format", () => {
            const url = "https://www.google.com/maps?q=30.0444,31.2357";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
            expect(result?.lng).toBeCloseTo(31.2357);
        });
        it("should parse place/@lat,lng format", () => {
            const url = "https://www.google.com/maps/place/Cairo+Tower/@30.0459,31.2243,17z";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0459);
            expect(result?.lng).toBeCloseTo(31.2243);
        });
        it("should parse ll=lat,lng format", () => {
            const url = "https://maps.google.com/maps?ll=30.0444,31.2357&z=17";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
            expect(result?.lng).toBeCloseTo(31.2357);
        });
        it("should return null for invalid URL", () => {
            const url = "https://example.com/not-a-map";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).toBeNull();
        });
        it("should handle negative coordinates", () => {
            const url = "https://www.google.com/maps/@-33.8688,151.2093,17z";
            const result = service.parseGoogleMapsUrl(url);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(-33.8688);
            expect(result?.lng).toBeCloseTo(151.2093);
        });
    });
    describe("extractLocationFromText", () => {
        it("should extract Google Maps URL from text", () => {
            const text = "عنواني هو https://www.google.com/maps/@30.0444,31.2357,17z بجوار المول";
            const result = service.extractLocationFromText(text);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
        });
        it("should extract raw coordinates from text", () => {
            const text = "الموقع 30.0444, 31.2357";
            const result = service.extractLocationFromText(text);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
        });
        it("should handle Arabic comma separator", () => {
            const text = "الإحداثيات 30.0444، 31.2357";
            const result = service.extractLocationFromText(text);
            expect(result).not.toBeNull();
            expect(result?.lat).toBeCloseTo(30.0444);
        });
        it("should return null for text without location", () => {
            const text = "مرحبا، أنا في القاهرة";
            const result = service.extractLocationFromText(text);
            expect(result).toBeNull();
        });
    });
    describe("getRequiredDepth", () => {
        it("should return building for FOOD category", () => {
            expect(service.getRequiredDepth("FOOD")).toBe("building");
        });
        it("should return building for SUPERMARKET category", () => {
            expect(service.getRequiredDepth("SUPERMARKET")).toBe("building");
        });
        it("should return area for CLOTHES category", () => {
            expect(service.getRequiredDepth("CLOTHES")).toBe("area");
        });
        it("should return street for unknown category", () => {
            expect(service.getRequiredDepth("UNKNOWN")).toBe("street");
        });
    });
    describe("meetsRequiredDepth", () => {
        it("should return true when depth exceeds requirement", () => {
            const address = {
                city: "القاهرة",
                area: "المعادي",
                street: "شارع 9",
                building: "عمارة 5",
            };
            const result = service.meetsRequiredDepth(address, "CLOTHES");
            expect(result.meets).toBe(true);
            expect(result.currentLevel).toBe("building");
            expect(result.requiredLevel).toBe("area");
        });
        it("should return false when depth is insufficient", () => {
            const address = {
                city: "القاهرة",
                area: "المعادي",
            };
            const result = service.meetsRequiredDepth(address, "FOOD");
            expect(result.meets).toBe(false);
            expect(result.currentLevel).toBe("area");
            expect(result.requiredLevel).toBe("building");
            expect(result.missingForRequired.length).toBeGreaterThan(0);
        });
    });
});
