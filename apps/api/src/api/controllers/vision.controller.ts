import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiBody,
} from "@nestjs/swagger";
import { VisionService } from "../../application/llm/vision.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import {
  ProcessReceiptDto,
  AnalyzeProductDto,
  AnalyzeMedicineDto,
  ExtractTextDto,
  VISION_SECURITY,
} from "../dto/vision.dto";

@ApiTags("Vision/OCR")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("VISION_OCR")
@Controller("v1/vision")
export class VisionController {
  private readonly logger = new Logger(VisionController.name);

  constructor(private readonly visionService: VisionService) {}

  @Post("receipt")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Process payment receipt",
    description:
      "Analyze InstaPay/bank transfer receipt image and extract payment details",
  })
  @ApiBody({ type: ProcessReceiptDto })
  @ApiResponse({ status: 200, description: "Receipt processed successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid image or processing failed",
  })
  async processReceipt(@Body() dto: ProcessReceiptDto) {
    this.logger.log("Processing payment receipt");
    const result = await this.visionService.processPaymentReceipt(
      dto.imageBase64,
    );
    return result;
  }

  @Post("product")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Analyze product image",
    description:
      "Analyze product image for catalog entry - extracts name, category, colors, suggested price, etc.",
  })
  @ApiBody({ type: AnalyzeProductDto })
  @ApiResponse({ status: 200, description: "Product analyzed successfully" })
  async analyzeProduct(@Body() dto: AnalyzeProductDto) {
    this.logger.log("Analyzing product image");
    const result = await this.visionService.analyzeProductImage(
      dto.imageBase64,
      dto.merchantCategory,
    );
    return result;
  }

  @Post("medicine")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Analyze medicine image",
    description:
      "Analyze medicine/pharmaceutical image - extracts medicine name, dosage, instructions, warnings",
  })
  @ApiBody({ type: AnalyzeMedicineDto })
  @ApiResponse({ status: 200, description: "Medicine analyzed successfully" })
  async analyzeMedicine(@Body() dto: AnalyzeMedicineDto) {
    this.logger.log("Analyzing medicine image");
    const result = await this.visionService.analyzeMedicineImage(
      dto.imageBase64,
    );
    return result;
  }

  @Post("extract-text")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Extract text from image (OCR)",
    description:
      "General OCR - extract all text from any image, preserving Arabic text",
  })
  @ApiBody({ type: ExtractTextDto })
  @ApiResponse({ status: 200, description: "Text extracted successfully" })
  async extractText(@Body() dto: ExtractTextDto) {
    this.logger.log("Extracting text from image");
    const result = await this.visionService.extractText(dto.imageBase64);
    return result;
  }
}
