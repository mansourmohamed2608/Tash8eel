import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  VoiceAiService,
  VoiceMessage,
} from "../../application/services/voice-ai.service";
import {
  RealTimeEvent,
  WebSocketService,
} from "../../infrastructure/websocket/websocket.service";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";

const twilio = require("twilio");

interface TwilioVoicePayload {
  CallSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  CallStatus?: string;
  DialCallStatus?: string;
  CallDuration?: string;
  SpeechResult?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  Direction?: string;
  [key: string]: unknown;
}

interface VoiceTranscriptTurn {
  speaker: "customer" | "ai" | "system";
  text: string;
  at: string;
}

@ApiTags("Voice")
@Controller("v1/voice")
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);
  private readonly twilioAuthToken: string;
  private readonly twilioPhoneNumber: string;
  private readonly twilioWebhookWhitelist = new Set<string>([
    "/v1/voice/incoming",
    "/v1/voice/ai-handler",
    "/v1/voice/process-speech",
    "/v1/voice/status-callback",
  ]);

  private readonly ttsAudioCache = new Map<
    string,
    { buffer: Buffer; mimeType: string; createdAt: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly voiceAiService: VoiceAiService,
    private readonly websocketService: WebSocketService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
  ) {
    this.twilioAuthToken = this.configService.get<string>(
      "TWILIO_AUTH_TOKEN",
      "",
    );
    this.twilioPhoneNumber = this.configService.get<string>(
      "TWILIO_PHONE_NUMBER",
      "",
    );
  }

  @Post("incoming")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Handle inbound Twilio voice call" })
  @ApiResponse({ status: 200, description: "TwiML returned" })
  async handleIncomingCall(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: TwilioVoicePayload,
    @Headers("x-twilio-signature") signature?: string,
  ): Promise<void> {
    if (!this.validateTwilioWebhook(req, body, signature)) {
      res.status(401).send("Invalid Twilio signature");
      return;
    }

    const callSid = String(body.CallSid || "").trim();
    const customerPhone = this.normalizeE164(String(body.From || ""));

    const merchantId = await this.resolveMerchantId(req, body);
    if (!merchantId) {
      this.logger.warn({
        msg: "Voice call rejected due to missing merchant mapping",
        callSid,
        to: body.To,
      });
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say(
        { language: "ar-EG", voice: "Polly.Zeina" },
        "الخدمة غير متاحة حالياً. حاول مرة تانية بعد شوية.",
      );
      twiml.hangup();
      this.sendTwiml(res, twiml);
      return;
    }

    await this.ensureVoiceCallRecord({
      merchantId,
      callSid,
      customerPhone,
      handledBy: "staff",
      status: "ringing",
    });

    this.websocketService.emit(merchantId, RealTimeEvent.CALL_ACTIVE, {
      callSid,
      customerPhone,
      handledBy: "staff",
      startedAt: new Date().toISOString(),
    });

    const aiHandlerUrl = this.buildAbsoluteUrl(
      req,
      `/api/v1/voice/ai-handler?merchantId=${encodeURIComponent(merchantId)}`,
    );

    const staffNumbers = await this.getStaffForwardNumbers(merchantId);
    const twiml = new twilio.twiml.VoiceResponse();

    if (staffNumbers.length > 0) {
      const dialOptions: Record<string, unknown> = {
        timeout: 15,
        answerOnBridge: true,
        method: "POST",
        action: aiHandlerUrl,
      };

      const callerId =
        this.normalizeE164(this.twilioPhoneNumber) ||
        this.normalizeE164(String(body.To || ""));
      if (callerId) {
        dialOptions.callerId = callerId;
      }

      const dial = twiml.dial(dialOptions);
      for (const number of staffNumbers) {
        dial.number(number);
      }
    } else {
      twiml.redirect(
        {
          method: "POST",
        },
        aiHandlerUrl,
      );
    }

    this.sendTwiml(res, twiml);
  }

  @Post("ai-handler")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Fallback to AI voice handling" })
  async handleAiHandler(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: TwilioVoicePayload,
    @Query("merchantId") merchantIdFromQuery?: string,
    @Headers("x-twilio-signature") signature?: string,
  ): Promise<void> {
    if (!this.validateTwilioWebhook(req, body, signature)) {
      res.status(401).send("Invalid Twilio signature");
      return;
    }

    const callSid = String(body.CallSid || "").trim();
    if (!callSid) {
      res.status(400).send("Missing CallSid");
      return;
    }

    const merchantId =
      String(merchantIdFromQuery || "").trim() ||
      (await this.resolveMerchantId(req, body));

    if (!merchantId) {
      res.status(404).send("Merchant not found");
      return;
    }

    const dialStatus = String(body.DialCallStatus || "")
      .trim()
      .toLowerCase();
    const staffAnswered = ["completed", "answered", "in-progress"].includes(
      dialStatus,
    );

    if (staffAnswered) {
      await this.updateVoiceCallStatus(callSid, {
        handledBy: "staff",
        status: dialStatus === "completed" ? "completed" : "active",
      });

      const twiml = new twilio.twiml.VoiceResponse();
      twiml.hangup();
      this.sendTwiml(res, twiml);
      return;
    }

    await this.updateVoiceCallStatus(callSid, {
      handledBy: "ai",
      status: "active",
    });

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { language: "ar-EG", voice: "Polly.Zeina" },
      "أهلاً بيك. أنا المساعد الصوتي للمحل. اتفضل قول طلبك أو سؤالك.",
    );

    this.appendGatherPrompt(twiml, req, merchantId, "أنا سامعك.");
    this.sendTwiml(res, twiml);
  }

  @Post("process-speech")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Process caller speech with Voice AI" })
  async processSpeech(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: TwilioVoicePayload,
    @Query("merchantId") merchantIdFromQuery?: string,
    @Headers("x-twilio-signature") signature?: string,
  ): Promise<void> {
    if (!this.validateTwilioWebhook(req, body, signature)) {
      res.status(401).send("Invalid Twilio signature");
      return;
    }

    const callSid = String(body.CallSid || "").trim();
    if (!callSid) {
      res.status(400).send("Missing CallSid");
      return;
    }

    const merchantId =
      String(merchantIdFromQuery || "").trim() ||
      (await this.resolveMerchantId(req, body));

    if (!merchantId) {
      res.status(404).send("Merchant not found");
      return;
    }

    const customerPhone = this.normalizeE164(String(body.From || ""));

    let transcript = String(body.SpeechResult || "").trim();
    if (!transcript && body.RecordingUrl) {
      transcript = await this.transcribeRecording(String(body.RecordingUrl));
    }

    const twiml = new twilio.twiml.VoiceResponse();

    if (!transcript) {
      twiml.say(
        { language: "ar-EG", voice: "Polly.Zeina" },
        "مسمعتكش كويس. ممكن تعيد كلامك باختصار؟",
      );
      this.appendGatherPrompt(
        twiml,
        req,
        merchantId,
        "اتفضل قول طلبك مرة تانية.",
      );
      this.sendTwiml(res, twiml);
      return;
    }

    await this.ensureVoiceCallRecord({
      merchantId,
      callSid,
      customerPhone,
      handledBy: "ai",
      status: "active",
    });

    const history = await this.getConversationHistory(callSid);
    await this.appendTranscriptTurn(callSid, {
      speaker: "customer",
      text: transcript,
      at: new Date().toISOString(),
    });

    const aiResponse = await this.voiceAiService.processVoiceInput(
      merchantId,
      customerPhone,
      transcript,
      history,
    );

    await this.appendTranscriptTurn(callSid, {
      speaker: "ai",
      text: aiResponse.text,
      at: new Date().toISOString(),
    });

    if (aiResponse.orderCreated?.id) {
      await this.attachOrderToCall(callSid, aiResponse.orderCreated.id);
    }

    await this.logVoiceRoutingDecision({
      merchantId,
      messageType: "voice_call",
      routingDecision: aiResponse.routingDecision || "voice_ai_response",
      modelUsed: "gpt-4o-mini",
      tokensUsed: aiResponse.tokensUsed || 0,
    });

    let usedElevenLabs = false;
    try {
      const audioBuffer = await this.voiceAiService.generateVoiceResponse(
        aiResponse.text,
      );
      this.cacheTtsAudio(callSid, audioBuffer, "audio/mpeg");

      const audioUrl = this.buildAbsoluteUrl(
        req,
        `/api/v1/voice/tts/${encodeURIComponent(callSid)}?v=${Date.now()}`,
      );
      twiml.play(audioUrl);
      usedElevenLabs = true;
    } catch (error) {
      this.logger.warn({
        msg: "ElevenLabs failed. Falling back to Twilio TTS",
        callSid,
        error: (error as Error).message,
      });
      twiml.say({ language: "ar-EG", voice: "Polly.Zeina" }, aiResponse.text);
    }

    if (aiResponse.endCall) {
      twiml.say(
        { language: "ar-EG", voice: "Polly.Zeina" },
        "تشرفنا بخدمتك. مع السلامة.",
      );
      twiml.hangup();
      await this.updateVoiceCallStatus(callSid, {
        status: "completed",
        handledBy: "ai",
      });
    } else {
      const prompt = usedElevenLabs
        ? "لو محتاج حاجة تانية اتفضل قولها دلوقتي."
        : "محتاج أي حاجة تانية؟";
      this.appendGatherPrompt(twiml, req, merchantId, prompt);
    }

    this.sendTwiml(res, twiml);
  }

  @Post("status-callback")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Handle Twilio call status callback" })
  async handleStatusCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: TwilioVoicePayload,
    @Headers("x-twilio-signature") signature?: string,
  ): Promise<void> {
    if (!this.validateTwilioWebhook(req, body, signature)) {
      res.status(401).send("Invalid Twilio signature");
      return;
    }

    const callSid = String(body.CallSid || "").trim();
    if (!callSid) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const callStatus = String(body.CallStatus || "")
      .trim()
      .toLowerCase();
    const duration = Number.parseInt(String(body.CallDuration || "0"), 10);
    const recordingUrl = String(body.RecordingUrl || "").trim() || null;

    const mappedStatus = this.mapFinalCallStatus(callStatus);

    try {
      const updateResult = await this.pool.query<{
        merchant_id: string;
        customer_phone: string;
        handled_by: string;
        order_id: string | null;
      }>(
        `UPDATE voice_calls
         SET
           ended_at = COALESCE(ended_at, NOW()),
           duration_seconds = CASE WHEN $2 >= 0 THEN $2 ELSE duration_seconds END,
           status = CASE WHEN $3 = '' THEN status ELSE $3 END,
           recording_url = COALESCE($4, recording_url)
         WHERE call_sid = $1
         RETURNING merchant_id, customer_phone, handled_by, order_id`,
        [
          callSid,
          Number.isFinite(duration) ? duration : -1,
          mappedStatus,
          recordingUrl,
        ],
      );

      const row = updateResult.rows[0];
      if (row?.merchant_id) {
        this.websocketService.emit(row.merchant_id, RealTimeEvent.CALL_ENDED, {
          callSid,
          customerPhone: row.customer_phone,
          handledBy: row.handled_by,
          status: mappedStatus || callStatus,
          durationSeconds: Number.isFinite(duration) ? duration : undefined,
          orderId: row.order_id,
        });
      }
    } catch (error) {
      this.logger.warn({
        msg: "Failed to persist voice status callback",
        callSid,
        error: (error as Error).message,
      });
    }

    this.pruneTtsCache();
    res.status(200).json({ status: "ok" });
  }

  @Get("tts/:callSid")
  @ApiExcludeEndpoint()
  async streamTtsAudio(
    @Param("callSid") callSid: string,
    @Res() res: Response,
  ): Promise<void> {
    this.pruneTtsCache();

    const cached = this.ttsAudioCache.get(callSid);
    if (!cached) {
      throw new NotFoundException("Audio not found");
    }

    res.setHeader("Content-Type", cached.mimeType);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).send(cached.buffer);
  }

  private validateTwilioWebhook(
    req: Request,
    body: TwilioVoicePayload,
    signature?: string,
  ): boolean {
    const normalizedPath = this.normalizeWebhookPath(req.path);
    if (!this.twilioWebhookWhitelist.has(normalizedPath)) {
      this.logger.warn({
        msg: "Blocked non-whitelisted Twilio webhook path",
        path: req.path,
        normalizedPath,
      });
      return false;
    }

    if (!this.twilioAuthToken) {
      this.logger.warn(
        "TWILIO_AUTH_TOKEN is missing. Twilio webhook signature validation is skipped.",
      );
      return true;
    }

    if (!signature) {
      return false;
    }

    const url = this.getFullRequestUrl(req);
    const params = this.stringifyPayload(body);

    return twilio.validateRequest(this.twilioAuthToken, signature, url, params);
  }

  private appendGatherPrompt(
    twiml: any,
    req: Request,
    merchantId: string,
    prompt: string,
  ): void {
    const processSpeechUrl = this.buildAbsoluteUrl(
      req,
      `/api/v1/voice/process-speech?merchantId=${encodeURIComponent(merchantId)}`,
    );

    const gather = twiml.gather({
      input: "speech",
      language: "ar-EG",
      speechTimeout: "auto",
      actionOnEmptyResult: true,
      method: "POST",
      action: processSpeechUrl,
    });

    gather.say({ language: "ar-EG", voice: "Polly.Zeina" }, prompt);
  }

  private sendTwiml(res: Response, twiml: any): void {
    res.type("text/xml").status(200).send(twiml.toString());
  }

  private getFullRequestUrl(req: Request): string {
    const protoHeader = req.headers["x-forwarded-proto"];
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;

    const proto = Array.isArray(protoHeader)
      ? protoHeader[0]
      : String(protoHeader || req.protocol || "https")
          .split(",")[0]
          .trim();

    const host = Array.isArray(hostHeader)
      ? hostHeader[0]
      : String(hostHeader || "")
          .split(",")[0]
          .trim();

    return `${proto}://${host}${req.originalUrl}`;
  }

  private buildAbsoluteUrl(req: Request, path: string): string {
    const protoHeader = req.headers["x-forwarded-proto"];
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;

    const proto = Array.isArray(protoHeader)
      ? protoHeader[0]
      : String(protoHeader || req.protocol || "https")
          .split(",")[0]
          .trim();

    const host = Array.isArray(hostHeader)
      ? hostHeader[0]
      : String(hostHeader || "")
          .split(",")[0]
          .trim();

    return `${proto}://${host}${path}`;
  }

  private stringifyPayload(
    payload: TwilioVoicePayload,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(payload || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        result[key] = String(value[0] ?? "");
      } else {
        result[key] = String(value);
      }
    }

    return result;
  }

  private normalizeWebhookPath(path: string): string {
    if (path.startsWith("/api/")) {
      return path.slice(4);
    }
    return path;
  }

  private async resolveMerchantId(
    req: Request,
    body: TwilioVoicePayload,
  ): Promise<string | null> {
    const fromQuery = String(req.query.merchantId || "").trim();
    if (fromQuery) {
      const merchant = await this.pool.query<{ id: string }>(
        `SELECT id FROM merchants WHERE id = $1 AND is_active = true LIMIT 1`,
        [fromQuery],
      );
      if (merchant.rows[0]) {
        return merchant.rows[0].id;
      }
    }

    const callSid = String(body.CallSid || "").trim();
    if (callSid) {
      try {
        const callLookup = await this.pool.query<{ merchant_id: string }>(
          `SELECT merchant_id FROM voice_calls WHERE call_sid = $1 ORDER BY started_at DESC LIMIT 1`,
          [callSid],
        );
        if (callLookup.rows[0]?.merchant_id) {
          return callLookup.rows[0].merchant_id;
        }
      } catch {
        // Continue with phone-based lookup when migration is not applied yet.
      }
    }

    const calledNumber = this.normalizeE164(String(body.To || ""));
    const digitsOnly = calledNumber.replace(/\D/g, "");
    if (!digitsOnly) {
      return null;
    }

    const mapping = await this.pool.query<{ merchant_id: string }>(
      `SELECT merchant_id
       FROM merchant_phone_numbers
       WHERE is_active = true
         AND (
           regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $1
           OR regexp_replace(COALESCE(whatsapp_number, ''), '[^0-9]', '', 'g') = $1
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [digitsOnly],
    );

    if (mapping.rows[0]?.merchant_id) {
      return mapping.rows[0].merchant_id;
    }

    const merchantFallback = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM merchants
       WHERE is_active = true
         AND (
           regexp_replace(COALESCE(notification_phone, ''), '[^0-9]', '', 'g') = $1
           OR regexp_replace(COALESCE(whatsapp_number, ''), '[^0-9]', '', 'g') = $1
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [digitsOnly],
    );

    return merchantFallback.rows[0]?.id || null;
  }

  private async getStaffForwardNumbers(merchantId: string): Promise<string[]> {
    const normalized = new Set<string>();

    const merchantResult = await this.pool.query<{
      notification_phone: string | null;
    }>(
      `SELECT notification_phone
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );

    const merchantPhone = this.normalizeE164(
      String(merchantResult.rows[0]?.notification_phone || ""),
    );
    if (merchantPhone) {
      normalized.add(merchantPhone);
    }

    const endpointRows = await this.pool.query<{
      config: Record<string, unknown> | null;
    }>(
      `SELECT config
       FROM integration_endpoints
       WHERE merchant_id = $1
         AND status = 'ACTIVE'
         AND lower(provider) = ANY($2::text[])
       ORDER BY updated_at DESC
       LIMIT 5`,
      [merchantId, ["twilio", "twilio_voice", "voice"]],
    );

    for (const row of endpointRows.rows) {
      let config: Record<string, unknown> = {};
      if (row.config && typeof row.config === "object") {
        config = row.config;
      } else if (typeof row.config === "string") {
        try {
          config = JSON.parse(row.config) as Record<string, unknown>;
        } catch {
          config = {};
        }
      }
      const candidateValues: unknown[] = [
        config["staffNumbers"],
        config["staff_numbers"],
        config["forwardTo"],
        config["forward_to"],
      ];

      for (const candidate of candidateValues) {
        if (Array.isArray(candidate)) {
          for (const phone of candidate) {
            const normalizedPhone = this.normalizeE164(String(phone || ""));
            if (normalizedPhone) {
              normalized.add(normalizedPhone);
            }
          }
        } else if (typeof candidate === "string") {
          const normalizedPhone = this.normalizeE164(candidate);
          if (normalizedPhone) {
            normalized.add(normalizedPhone);
          }
        }
      }
    }

    const envNumbers = String(
      this.configService.get<string>("TWILIO_STAFF_FORWARD_NUMBERS", ""),
    )
      .split(",")
      .map((entry) => this.normalizeE164(entry))
      .filter((entry) => entry.length > 0);

    for (const phone of envNumbers) {
      normalized.add(phone);
    }

    return Array.from(normalized);
  }

  private normalizeE164(value: string): string {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const withoutPrefix = raw
      .replace(/^whatsapp:/i, "")
      .replace(/^client:/i, "")
      .replace(/\s+/g, "")
      .replace(/[\-()]/g, "");

    if (withoutPrefix.startsWith("+")) {
      return `+${withoutPrefix.replace(/[^0-9]/g, "")}`;
    }

    if (withoutPrefix.startsWith("00")) {
      return `+${withoutPrefix.slice(2).replace(/[^0-9]/g, "")}`;
    }

    const digits = withoutPrefix.replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("20")) {
      return `+${digits}`;
    }

    if (digits.startsWith("0")) {
      return `+2${digits}`;
    }

    return `+${digits}`;
  }

  private async ensureVoiceCallRecord(input: {
    merchantId: string;
    callSid: string;
    customerPhone: string;
    handledBy: "ai" | "staff";
    status: string;
  }): Promise<void> {
    if (!input.callSid || !input.merchantId) {
      return;
    }

    try {
      const existing = await this.pool.query<{ id: string }>(
        `SELECT id::text as id
         FROM voice_calls
         WHERE call_sid = $1
         ORDER BY started_at DESC
         LIMIT 1`,
        [input.callSid],
      );

      if (existing.rows[0]?.id) {
        return;
      }

      await this.pool.query(
        `INSERT INTO voice_calls (
           merchant_id,
           customer_phone,
           call_sid,
           handled_by,
           status,
           transcript
         ) VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)`,
        [
          input.merchantId,
          input.customerPhone,
          input.callSid,
          input.handledBy,
          input.status,
        ],
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to ensure voice call record",
        callSid: input.callSid,
        error: (error as Error).message,
      });
    }
  }

  private async updateVoiceCallStatus(
    callSid: string,
    patch: { handledBy?: "ai" | "staff"; status?: string },
  ): Promise<void> {
    if (!callSid) return;

    const fields: string[] = [];
    const params: unknown[] = [];

    if (patch.handledBy) {
      params.push(patch.handledBy);
      fields.push(`handled_by = $${params.length}`);
    }

    if (patch.status) {
      params.push(patch.status);
      fields.push(`status = $${params.length}`);
    }

    if (fields.length === 0) return;

    params.push(callSid);

    try {
      await this.pool.query(
        `UPDATE voice_calls
         SET ${fields.join(", ")}
         WHERE call_sid = $${params.length}`,
        params,
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to update voice call status",
        callSid,
        error: (error as Error).message,
      });
    }
  }

  private async appendTranscriptTurn(
    callSid: string,
    turn: VoiceTranscriptTurn,
  ): Promise<void> {
    if (!callSid || !turn.text.trim()) return;

    try {
      await this.pool.query(
        `UPDATE voice_calls
         SET transcript = COALESCE(transcript, '[]'::jsonb) || $2::jsonb
         WHERE call_sid = $1`,
        [callSid, JSON.stringify([turn])],
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to append voice transcript turn",
        callSid,
        error: (error as Error).message,
      });
    }
  }

  private async getConversationHistory(
    callSid: string,
  ): Promise<VoiceMessage[]> {
    if (!callSid) return [];

    try {
      const result = await this.pool.query<{
        transcript: unknown;
      }>(
        `SELECT COALESCE(transcript, '[]'::jsonb) as transcript
         FROM voice_calls
         WHERE call_sid = $1
         ORDER BY started_at DESC
         LIMIT 1`,
        [callSid],
      );

      const transcriptRaw = result.rows[0]?.transcript;
      if (!Array.isArray(transcriptRaw)) {
        return [];
      }

      return transcriptRaw
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          const speaker = String(row.speaker || "").toLowerCase();
          const text = String(row.text || "").trim();
          const at = String(row.at || "").trim();

          if (!text) return null;

          return {
            role: speaker === "ai" ? "assistant" : "customer",
            text,
            timestamp: at || undefined,
          } as VoiceMessage;
        })
        .filter((entry): entry is VoiceMessage => !!entry);
    } catch {
      return [];
    }
  }

  private async attachOrderToCall(
    callSid: string,
    orderId: string,
  ): Promise<void> {
    if (!callSid || !orderId) return;

    try {
      await this.pool.query(
        `UPDATE voice_calls
         SET order_id = $2
         WHERE call_sid = $1`,
        [callSid, orderId],
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to attach order to voice call",
        callSid,
        orderId,
        error: (error as Error).message,
      });
    }
  }

  private async transcribeRecording(recordingUrl: string): Promise<string> {
    const url = String(recordingUrl || "").trim();
    if (!url) {
      return "";
    }

    try {
      const adapter = this.transcriptionFactory.getAdapter();
      const result = await adapter.transcribe(url, { language: "ar" });
      return String(result.text || "").trim();
    } catch (error) {
      this.logger.warn({
        msg: "Whisper transcription for Twilio recording failed",
        recordingUrl: url,
        error: (error as Error).message,
      });
      return "";
    }
  }

  private async logVoiceRoutingDecision(input: {
    merchantId: string;
    messageType: string;
    routingDecision: string;
    modelUsed: string;
    tokensUsed: number;
  }): Promise<void> {
    const planName = await this.getMerchantPlanName(input.merchantId);
    const estimatedCostUsd = Number(
      ((Math.max(0, input.tokensUsed) / 1000) * 0.0012).toFixed(6),
    );

    try {
      await this.pool.query(
        `INSERT INTO ai_routing_log (
           merchant_id,
           plan_name,
           message_type,
           complexity_score,
           routing_decision,
           model_used,
           estimated_cost_usd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.merchantId,
          planName,
          input.messageType,
          null,
          input.routingDecision,
          input.modelUsed,
          estimatedCostUsd,
        ],
      );
    } catch {
      // Analytics table may not exist on all environments.
    }
  }

  private async getMerchantPlanName(merchantId: string): Promise<string> {
    try {
      const result = await this.pool.query<{ plan_name: string }>(
        `SELECT
           LOWER(COALESCE(NULLIF(p.name, ''), NULLIF(p.code, ''), 'starter')) AS plan_name
         FROM merchants m
         LEFT JOIN subscriptions s
           ON s.merchant_id = m.id
          AND s.status = 'ACTIVE'
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE m.id = $1
         ORDER BY s.created_at DESC NULLS LAST
         LIMIT 1`,
        [merchantId],
      );

      return String(result.rows[0]?.plan_name || "starter");
    } catch {
      return "starter";
    }
  }

  private cacheTtsAudio(
    callSid: string,
    buffer: Buffer,
    mimeType: string,
  ): void {
    this.ttsAudioCache.set(callSid, {
      buffer,
      mimeType,
      createdAt: Date.now(),
    });

    this.pruneTtsCache();
  }

  private pruneTtsCache(): void {
    const now = Date.now();
    const maxAgeMs = 10 * 60 * 1000;

    for (const [key, value] of this.ttsAudioCache.entries()) {
      if (now - value.createdAt > maxAgeMs) {
        this.ttsAudioCache.delete(key);
      }
    }
  }

  private mapFinalCallStatus(callStatus: string): string {
    const normalized = String(callStatus || "").toLowerCase();

    if (["busy", "failed", "no-answer", "canceled"].includes(normalized)) {
      return "missed";
    }

    if (normalized === "completed") {
      return "completed";
    }

    return normalized || "completed";
  }
}
