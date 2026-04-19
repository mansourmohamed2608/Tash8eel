import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";
import * as jwt from "jsonwebtoken";

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  canActivate(context: ExecutionContext): boolean {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = this.extractToken(client);

      if (!token) {
        throw new WsException("Missing authentication token");
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new WsException("JWT secret not configured");
      }

      const payload = jwt.verify(token, secret) as any;

      // Attach user data to socket
      client.data.userId = payload.sub;
      client.data.merchantId = payload.merchantId;
      client.data.role = payload.role;

      return true;
    } catch (error) {
      this.logger.warn(`WebSocket authentication failed: ${error}`);
      throw new WsException("Unauthorized");
    }
  }

  private extractToken(client: Socket): string | null {
    // Try from auth header in handshake
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    // Try from query params
    const token = client.handshake.query.token;
    if (typeof token === "string") {
      return token;
    }

    // Try from auth object
    const auth = client.handshake.auth;
    if (auth?.token) {
      return auth.token;
    }

    return null;
  }
}
