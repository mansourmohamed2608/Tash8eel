import { Injectable, Logger } from "@nestjs/common";
import { AddressValidationPolicyFactory } from "../policies/address-validation.policy";
import { ExtractedAddress } from "../../shared/schemas";

export interface AddressDepth {
  level: "city" | "area" | "street" | "building" | "full";
  score: number; // 0-100
  missingFields: string[];
  suggestions: string[];
  parsedComponents: {
    city?: string;
    area?: string;
    district?: string;
    street?: string;
    building?: string;
    floor?: string;
    apartment?: string;
    landmark?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
}

export interface GoogleMapsLocation {
  lat: number;
  lng: number;
  placeId?: string;
  formattedAddress?: string;
}

@Injectable()
export class AddressDepthService {
  private readonly logger = new Logger(AddressDepthService.name);

  constructor(
    private readonly addressValidationFactory: AddressValidationPolicyFactory,
  ) {}

  /**
   * Analyze address depth and return structured information
   */
  analyzeDepth(address: ExtractedAddress, city?: string): AddressDepth {
    const validator = this.addressValidationFactory.getValidator(city);
    const result = validator.validate(address, []);

    // Calculate depth level
    const filledFields = this.countFilledFields(address);
    let level: AddressDepth["level"];
    let score: number;

    if (filledFields >= 5) {
      level = "full";
      score = 100;
    } else if (address.building || address.landmark) {
      level = "building";
      score = 80;
    } else if (address.street) {
      level = "street";
      score = 60;
    } else if (address.area) {
      level = "area";
      score = 40;
    } else {
      level = "city";
      score = 20;
    }

    // Generate suggestions based on missing fields
    const suggestions = this.generateSuggestions(result.missingFields);

    return {
      level,
      score,
      missingFields: result.missingFields,
      suggestions,
      parsedComponents: {
        city: address.city || city,
        area: address.area,
        street: address.street,
        building: address.building,
        floor: address.floor,
        apartment: address.apartment,
        landmark: address.landmark,
      },
    };
  }

  /**
   * Parse Google Maps URL to extract coordinates
   * Supports various Google Maps URL formats:
   * - https://www.google.com/maps?q=30.0444,31.2357
   * - https://maps.google.com/maps?q=30.0444,31.2357
   * - https://goo.gl/maps/xxxxx (short URLs)
   * - https://www.google.com/maps/place/.../@30.0444,31.2357,17z
   * - https://www.google.com/maps/@30.0444,31.2357,17z
   */
  parseGoogleMapsUrl(url: string): GoogleMapsLocation | null {
    try {
      // Normalize URL
      const trimmedUrl = url.trim();

      // Pattern 1: @lat,lng format in URL
      const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const atMatch = trimmedUrl.match(atPattern);
      if (atMatch) {
        return {
          lat: parseFloat(atMatch[1]),
          lng: parseFloat(atMatch[2]),
        };
      }

      // Pattern 2: q=lat,lng format
      const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const qMatch = trimmedUrl.match(qPattern);
      if (qMatch) {
        return {
          lat: parseFloat(qMatch[1]),
          lng: parseFloat(qMatch[2]),
        };
      }

      // Pattern 3: ll=lat,lng format
      const llPattern = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const llMatch = trimmedUrl.match(llPattern);
      if (llMatch) {
        return {
          lat: parseFloat(llMatch[1]),
          lng: parseFloat(llMatch[2]),
        };
      }

      // Pattern 4: !3d and !4d format (embedded coordinates)
      const embeddedPattern = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/;
      const embeddedMatch = trimmedUrl.match(embeddedPattern);
      if (embeddedMatch) {
        return {
          lat: parseFloat(embeddedMatch[1]),
          lng: parseFloat(embeddedMatch[2]),
        };
      }

      // Pattern 5: place/name/@lat,lng
      const placePattern = /place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const placeMatch = trimmedUrl.match(placePattern);
      if (placeMatch) {
        return {
          lat: parseFloat(placeMatch[1]),
          lng: parseFloat(placeMatch[2]),
        };
      }

      this.logger.warn({
        msg: "Could not parse Google Maps URL",
        url: trimmedUrl,
      });

      return null;
    } catch (error) {
      this.logger.error({
        msg: "Error parsing Google Maps URL",
        url,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Extract location from message text
   * Looks for Google Maps URLs or coordinate patterns
   */
  extractLocationFromText(text: string): GoogleMapsLocation | null {
    // Look for Google Maps URLs
    const urlPattern =
      /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps)[^\s]*/gi;
    const urls = text.match(urlPattern);

    if (urls && urls.length > 0) {
      for (const url of urls) {
        const location = this.parseGoogleMapsUrl(url);
        if (location) return location;
      }
    }

    // Look for raw coordinate patterns (lat, lng)
    const coordPattern = /(-?\d{1,3}\.?\d{4,})\s*[,،]\s*(-?\d{1,3}\.?\d{4,})/;
    const coordMatch = text.match(coordPattern);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);

      // Validate coordinates are reasonable
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    return null;
  }

  /**
   * Calculate required address depth based on merchant category
   */
  getRequiredDepth(category: string): AddressDepth["level"] {
    const categoryMap: Record<string, AddressDepth["level"]> = {
      FOOD: "building", // Food delivery needs exact location
      SUPERMARKET: "building", // Grocery needs exact location
      CLOTHES: "area", // Fashion can ship to area
      ELECTRONICS: "area", // Electronics can ship to area
      GENERIC: "street", // Generic default
    };

    return categoryMap[category.toUpperCase()] || "street";
  }

  /**
   * Check if address meets required depth for category
   */
  meetsRequiredDepth(
    address: ExtractedAddress,
    category: string,
    city?: string,
  ): {
    meets: boolean;
    currentLevel: AddressDepth["level"];
    requiredLevel: AddressDepth["level"];
    missingForRequired: string[];
  } {
    const depth = this.analyzeDepth(address, city);
    const requiredLevel = this.getRequiredDepth(category);

    const levelOrder: AddressDepth["level"][] = [
      "city",
      "area",
      "street",
      "building",
      "full",
    ];
    const currentIndex = levelOrder.indexOf(depth.level);
    const requiredIndex = levelOrder.indexOf(requiredLevel);

    const meets = currentIndex >= requiredIndex;

    // Determine what's missing to reach required level
    const missingForRequired: string[] = [];
    if (!meets) {
      if (requiredIndex >= 1 && !address.area) missingForRequired.push("area");
      if (requiredIndex >= 2 && !address.street)
        missingForRequired.push("street");
      if (requiredIndex >= 3 && !address.building && !address.landmark) {
        missingForRequired.push("building or landmark");
      }
    }

    return {
      meets,
      currentLevel: depth.level,
      requiredLevel,
      missingForRequired,
    };
  }

  private countFilledFields(address: ExtractedAddress): number {
    let count = 0;
    if (address.city) count++;
    if (address.area) count++;
    if (address.street) count++;
    if (address.building) count++;
    if (address.floor) count++;
    if (address.apartment) count++;
    if (address.landmark) count++;
    return count;
  }

  private generateSuggestions(missingFields: string[]): string[] {
    const suggestionMap: Record<string, string> = {
      city: "ممكن تحدد المدينة اللي انت فيها؟",
      area: "ممكن تقولي اسم المنطقة أو الحي؟",
      street: "ممكن تقولي اسم الشارع؟",
      building: "ممكن تحدد رقم العمارة أو اسمها؟",
      floor: "ممكن تقولي الدور كام؟",
      apartment: "ممكن تقولي رقم الشقة؟",
      landmark: "فيه علامة مميزة قريبة منك؟",
    };

    return missingFields
      .slice(0, 2) // Only first 2 suggestions
      .map((field) => suggestionMap[field])
      .filter(Boolean);
  }
}
