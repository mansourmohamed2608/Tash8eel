import { InboxMessageDto, InboxResponseDto } from "../dto/inbox.dto";
import { InboxService } from "../../application/services/inbox.service";
export declare class InboxController {
    private readonly inboxService;
    private readonly logger;
    constructor(inboxService: InboxService);
    processMessage(dto: InboxMessageDto, correlationId?: string): Promise<InboxResponseDto>;
}
