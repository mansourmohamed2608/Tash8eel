import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import { ZodSchema, ZodError, ZodIssue } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((e: ZodIssue) => ({
          path: e.path.join("."),
          message: e.message,
        }));

        throw new BadRequestException({
          message: "Validation failed",
          details: formattedErrors,
        });
      }
      throw error;
    }
  }
}
