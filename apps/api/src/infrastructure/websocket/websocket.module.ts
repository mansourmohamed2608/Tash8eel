import { Module, Global } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";
import { WebSocketService } from "./websocket.service";

@Global()
@Module({
  providers: [EventsGateway, WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
