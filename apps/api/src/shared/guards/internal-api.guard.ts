import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/**
 * Guard for internal service-to-service API calls (worker -> api)
 * Uses a separate internal API key from merchant/admin keys
 */
@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers["x-internal-api-key"] as string;

    const validApiKey = this.configService.get<string>("INTERNAL_API_KEY");

    // SECURITY: Always require a valid API key — no NODE_ENV bypass
    if (!validApiKey) {
      throw new UnauthorizedException(
        "INTERNAL_API_KEY not configured — set it in environment variables",
      );
    }

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException("Invalid or missing internal API key");
    }

    return true;
  }
}
