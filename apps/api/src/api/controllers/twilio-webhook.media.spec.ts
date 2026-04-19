import { TwilioWebhookController } from "./twilio-webhook.controller";

function createController(adapterOverrides: Record<string, jest.Mock> = {}) {
  const adapter = {
    sendTextMessage: jest.fn().mockResolvedValue({
      success: true,
      messageSid: "SM_TEXT",
      status: "queued",
    }),
    sendMediaMessage: jest.fn().mockResolvedValue({
      success: true,
      messageSid: "SM_MEDIA",
      status: "queued",
    }),
    validateSignature: jest.fn(),
    parseWebhook: jest.fn(),
    parseStatusCallback: jest.fn(),
    getMerchantByWhatsAppNumber: jest.fn(),
    downloadMedia: jest.fn(),
    logInboundMessage: jest.fn(),
    updateMessageStatus: jest.fn(),
    ...adapterOverrides,
  };

  const controller = new TwilioWebhookController(
    { get: jest.fn().mockReturnValue("false") } as any,
    {} as any,
    adapter as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { controller: controller as any, adapter };
}

describe("TwilioWebhookController media delivery", () => {
  it("sends inbox media attachments as Twilio media messages, not URL text", async () => {
    const { controller, adapter } = createController();

    await controller.sendInboxResponseViaTwilio(
      "whatsapp:+201000000000",
      {
        conversationId: "conversation-1",
        replyText: "الصورة مرفقة مع الرسالة.",
        mediaAttachments: [
          {
            url: "https://cdn.example.com/product-1.jpg",
            caption: "صورة المنتج الأولى",
            fallbackText: "صورة المنتج الأولى غير متاحة حالياً",
          },
          {
            url: "https://cdn.example.com/product-2.jpg",
            caption: "صورة المنتج الثانية",
          },
        ],
      },
      "corr-1",
    );

    expect(adapter.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(adapter.sendTextMessage).toHaveBeenCalledWith(
      "whatsapp:+201000000000",
      "الصورة مرفقة مع الرسالة.",
    );
    expect(adapter.sendTextMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("https://cdn.example.com"),
    );
    expect(adapter.sendMediaMessage).toHaveBeenCalledTimes(2);
    expect(adapter.sendMediaMessage).toHaveBeenNthCalledWith(
      1,
      "whatsapp:+201000000000",
      "https://cdn.example.com/product-1.jpg",
      "صورة المنتج الأولى",
    );
    expect(adapter.sendMediaMessage).toHaveBeenNthCalledWith(
      2,
      "whatsapp:+201000000000",
      "https://cdn.example.com/product-2.jpg",
      "صورة المنتج الثانية",
    );
  });

  it("falls back to attachment fallback text when Twilio media sending fails", async () => {
    const { controller, adapter } = createController({
      sendMediaMessage: jest.fn().mockResolvedValue({
        success: false,
        errorCode: "MEDIA_REJECTED",
        errorMessage: "Media URL rejected",
      }),
    });

    await controller.sendInboxResponseViaTwilio(
      "whatsapp:+201000000000",
      {
        conversationId: "conversation-1",
        replyText: "الصورة مرفقة مع الرسالة.",
        mediaAttachments: [
          {
            url: "https://cdn.example.com/product.jpg",
            caption: "كابشن المنتج",
            fallbackText: "لو الصورة ما وصلتش: كابشن المنتج",
          },
        ],
      },
      "corr-2",
    );

    expect(adapter.sendMediaMessage).toHaveBeenCalledWith(
      "whatsapp:+201000000000",
      "https://cdn.example.com/product.jpg",
      "كابشن المنتج",
    );
    expect(adapter.sendTextMessage).toHaveBeenNthCalledWith(
      1,
      "whatsapp:+201000000000",
      "الصورة مرفقة مع الرسالة.",
    );
    expect(adapter.sendTextMessage).toHaveBeenNthCalledWith(
      2,
      "whatsapp:+201000000000",
      "لو الصورة ما وصلتش: كابشن المنتج",
    );
  });

  it("keeps text-only replies on the existing Twilio text path", async () => {
    const { controller, adapter } = createController();

    await controller.sendInboxResponseViaTwilio(
      "whatsapp:+201000000000",
      {
        conversationId: "conversation-1",
        replyText: "تمام، معاك.",
      },
      "corr-3",
    );

    expect(adapter.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(adapter.sendMediaMessage).not.toHaveBeenCalled();
  });
});
