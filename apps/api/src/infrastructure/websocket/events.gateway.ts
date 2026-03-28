import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UseGuards } from "@nestjs/common";
import { WsJwtGuard } from "./ws-jwt.guard";
import * as jwt from "jsonwebtoken";

interface AuthenticatedSocket extends Socket {
  data: {
    merchantId?: string;
    userId?: string;
    role?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin:
      process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ||
      (process.env.NODE_ENV === "production" ? false : "*"),
    credentials: true,
  },
  namespace: "/ws",
  transports: ["websocket", "polling"],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  afterInit(): void {
    this.logger.log("WebSocket Gateway initialized");
    // Enforce JWT auth at connection time
    this.server.use((socket, next) => {
      const result = this.authenticateSocket(socket as AuthenticatedSocket);
      if (!result.ok) {
        this.logger.warn(`WebSocket auth rejected: ${result.error}`);
        return next(new Error("Unauthorized"));
      }
      return next();
    });
  }

  handleConnection(client: AuthenticatedSocket): void {
    const merchantId = client.data?.merchantId;
    if (!merchantId) {
      this.logger.warn(
        `WebSocket connection missing merchant context: ${client.id}`,
      );
      client.disconnect(true);
      return;
    }

    this.logger.log(`Client connected: ${client.id} (merchant ${merchantId})`);
    this.connectedClients.set(client.id, client);
    client.join(`merchant:${merchantId}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  /**
   * Authenticate and join merchant room
   */
  @SubscribeMessage("authenticate")
  @UseGuards(WsJwtGuard)
  handleAuthenticate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { token: string; merchantId: string },
  ): { success: boolean; message?: string } {
    try {
      const merchantId = client.data?.merchantId;
      if (!merchantId) {
        return { success: false, message: "Unauthorized" };
      }

      if (data?.merchantId && data.merchantId !== merchantId) {
        this.logger.warn(`WebSocket merchant mismatch for ${client.id}`);
        return { success: false, message: "Unauthorized" };
      }

      // Store client data
      client.data.merchantId = merchantId;
      this.connectedClients.set(client.id, client);

      // Join merchant-specific room
      client.join(`merchant:${merchantId}`);

      this.logger.log(
        `Client ${client.id} authenticated for merchant ${merchantId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Authentication failed: ${error}`);
      return { success: false, message: "Authentication failed" };
    }
  }

  /**
   * Subscribe to specific event types
   */
  @SubscribeMessage("subscribe")
  @UseGuards(WsJwtGuard)
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { events: string[] },
  ): { success: boolean; subscribed: string[] } {
    const { events } = data;
    const merchantId = client.data.merchantId;

    if (!merchantId) {
      return { success: false, subscribed: [] };
    }

    // Join event-specific rooms
    events.forEach((event) => {
      client.join(`merchant:${merchantId}:${event}`);
    });

    this.logger.log(`Client ${client.id} subscribed to: ${events.join(", ")}`);

    return { success: true, subscribed: events };
  }

  /**
   * Emit event to all connected clients of a merchant
   */
  emitToMerchant(merchantId: string, event: string, data: any): void {
    this.server.to(`merchant:${merchantId}`).emit(event, data);
    this.logger.debug(`Emitted ${event} to merchant ${merchantId}`);
  }

  /**
   * Emit to specific event subscribers
   */
  emitToSubscribers(merchantId: string, eventType: string, data: any): void {
    this.server.to(`merchant:${merchantId}:${eventType}`).emit(eventType, data);
  }

  /**
   * Get connected client count for a merchant
   */
  getConnectedCount(merchantId: string): number {
    const room = this.server.sockets.adapter.rooms.get(
      `merchant:${merchantId}`,
    );
    return room?.size || 0;
  }

  private authenticateSocket(client: AuthenticatedSocket): {
    ok: boolean;
    error?: string;
  } {
    const token = this.extractToken(client);
    if (!token) {
      return { ok: false, error: "Missing authentication token" };
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return { ok: false, error: "JWT secret not configured" };
    }

    try {
      const payload = jwt.verify(token, secret) as any;
      client.data.userId = payload.sub;
      client.data.merchantId = payload.merchantId;
      client.data.role = payload.role;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: "Invalid token" };
    }
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    const token = client.handshake.query.token;
    if (typeof token === "string") {
      return token;
    }

    const auth = client.handshake.auth;
    if (auth?.token) {
      return auth.token;
    }

    return null;
  }
}
