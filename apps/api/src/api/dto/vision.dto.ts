import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Max base64 image size: ~10MB (base64 is ~33% larger than binary)
const MAX_BASE64_LENGTH = 14_000_000;
// Min base64 length for a valid image
const MIN_BASE64_LENGTH = 100;

/**
 * Custom validator to check if base64 is a valid image type
 */
function IsValidBase64Image(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isValidBase64Image",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== "string") return false;

          // Check for valid base64 characters (allow data URI prefix)
          const base64Pattern =
            /^(?:data:image\/(?:jpeg|jpg|png|gif|webp);base64,)?[A-Za-z0-9+/]+=*$/;

          // Strip data URI prefix if present for testing
          const base64Data = value.replace(/^data:image\/[a-z]+;base64,/i, "");

          // Verify it's valid base64
          if (!base64Pattern.test(value) && !base64Pattern.test(base64Data)) {
            return false;
          }

          // Try to detect image magic bytes from base64
          // JPEG: /9j/
          // PNG: iVBORw
          // GIF: R0lGOD
          // WebP: UklGR
          const validHeaders = ["/9j/", "iVBORw", "R0lGOD", "UklGR"];

          // If data URI present, trust it; otherwise check magic bytes
          if (value.startsWith("data:image/")) {
            return true;
          }

          return validHeaders.some((header) => base64Data.startsWith(header));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid base64-encoded image (JPEG, PNG, GIF, or WebP)`;
        },
      },
    });
  };
}

/**
 * Custom validator to check base64 size limits
 */
function Base64SizeLimit(
  maxLength: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "base64SizeLimit",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxLength],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== "string") return false;
          const [max] = args.constraints;
          return value.length >= MIN_BASE64_LENGTH && value.length <= max;
        },
        defaultMessage(args: ValidationArguments) {
          const [max] = args.constraints;
          const maxMb = Math.round(max / 1_400_000); // Approximate MB
          return `${args.property} must be between ${MIN_BASE64_LENGTH} and ${max} characters (~${maxMb}MB)`;
        },
      },
    });
  };
}

/**
 * Base DTO for image processing endpoints
 */
export class ImageBase64Dto {
  @ApiProperty({
    description:
      "Base64-encoded image (JPEG, PNG, GIF, or WebP). Max size ~10MB.",
    example: "/9j/4AAQSkZJRg...",
  })
  @IsString()
  @IsNotEmpty({ message: "Image data is required" })
  @Base64SizeLimit(MAX_BASE64_LENGTH, {
    message: "Image too large. Maximum size is ~10MB",
  })
  @IsValidBase64Image({
    message: "Invalid image format. Supported: JPEG, PNG, GIF, WebP",
  })
  imageBase64!: string;
}

/**
 * DTO for processing payment receipts
 */
export class ProcessReceiptDto extends ImageBase64Dto {}

/**
 * DTO for analyzing product images
 */
export class AnalyzeProductDto extends ImageBase64Dto {
  @ApiPropertyOptional({
    description: "Merchant category hint for better analysis",
    example: "electronics",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantCategory?: string;
}

/**
 * DTO for analyzing medicine images
 */
export class AnalyzeMedicineDto extends ImageBase64Dto {}

/**
 * DTO for general OCR text extraction
 */
export class ExtractTextDto extends ImageBase64Dto {}

/**
 * Security constants for image uploads
 */
export const VISION_SECURITY = {
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_BASE64_LENGTH: MAX_BASE64_LENGTH,
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
};
