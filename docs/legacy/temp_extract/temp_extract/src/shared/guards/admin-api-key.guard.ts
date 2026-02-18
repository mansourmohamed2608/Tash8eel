import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers["x-admin-api-key"] as string;

    const validApiKey = this.configService.get<string>("ADMIN_API_KEY");

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException("Invalid or missing admin API key");
    }

    return true;
  }
}
