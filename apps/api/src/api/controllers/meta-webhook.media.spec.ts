import { MetaWebhookController } from "./meta-webhook.controller";

function createController(adapterOverrides: Record<string, jest.Mock> = {}) {
  const metaAdapter = {
    sendTextMessage: jest.fn().mockResolvedValue({
      success: true,
      messageId: "wamid.text",
      status: "sent",
    }),
    sendMediaMessage: jest.fn().mockResolvedValue({
      success: true,
      messageId: "wamid.media",
      status: "sent",
    }),
    ...adapterOverrides,
  };

  const controller = new MetaWebhookController(
    { get: jest.fn().mockReturnValue("test") } as any,
    {} as any,
    metaAdapter as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { controller: controller as any, metaAdapter };
}

describe("MetaWebhookController WhatsApp media delivery", () => {
  it("sends inbox media attachments as Meta image messages with the resolved phone number id", async () => {
    const { controller, metaAdapter } = createController();

    await controller.sendInboxResponseViaMetaWhatsApp(
      "201000000000",
      {
        conversationId: "conversation-1",
        replyText: "الصورة مرفقة مع الرسالة.",
        mediaAttachments: [
          {
            url: "https://cdn.example.com/product-1.jpg",
            caption: "صورة المنتج الأولى",
            fallbackText: "الصورة الأولى غير متاحة حالياً",
          },
          {
            url: "https://cdn.example.com/product-2.jpg",
            caption: "صورة المنتج الثانية",
          },
        ],
      },
      "corr-1",
      "phone-number-id-1",
    );

    expect(metaAdapter.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(metaAdapter.sendTextMessage).toHaveBeenCalledWith(
      "201000000000",
      "الصورة مرفقة مع الرسالة.",
      "phone-number-id-1",
    );
    expect(metaAdapter.sendTextMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("https://cdn.example.com"),
      expect.anything(),
    );
    expect(metaAdapter.sendMediaMessage).toHaveBeenCalledTimes(2);
    expect(metaAdapter.sendMediaMessage).toHaveBeenNthCalledWith(
      1,
      "201000000000",
      "https://cdn.example.com/product-1.jpg",
      "صورة المنتج الأولى",
      "phone-number-id-1",
    );
    expect(metaAdapter.sendMediaMessage).toHaveBeenNthCalledWith(
      2,
      "201000000000",
      "https://cdn.example.com/product-2.jpg",
      "صورة المنتج الثانية",
      "phone-number-id-1",
    );
  });

  it("sends fallback text only when Meta rejects an image", async () => {
    const { controller, metaAdapter } = createController({
      sendMediaMessage: jest.fn().mockResolvedValue({
        success: false,
        errorCode: "131000",
        errorMessage: "Media download failed",
      }),
    });

    await controller.sendInboxResponseViaMetaWhatsApp(
      "201000000000",
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
      "phone-number-id-1",
    );

    expect(metaAdapter.sendMediaMessage).toHaveBeenCalledWith(
      "201000000000",
      "https://cdn.example.com/product.jpg",
      "كابشن المنتج",
      "phone-number-id-1",
    );
    expect(metaAdapter.sendTextMessage).toHaveBeenNthCalledWith(
      1,
      "201000000000",
      "الصورة مرفقة مع الرسالة.",
      "phone-number-id-1",
    );
    expect(metaAdapter.sendTextMessage).toHaveBeenNthCalledWith(
      2,
      "201000000000",
      "لو الصورة ما وصلتش: كابشن المنتج",
      "phone-number-id-1",
    );
  });
});
