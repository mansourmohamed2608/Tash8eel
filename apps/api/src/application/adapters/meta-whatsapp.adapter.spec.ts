import { MetaWhatsAppAdapter } from "./meta-whatsapp.adapter";

function createAdapter() {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        META_ACCESS_TOKEN: "test-token",
        META_PHONE_NUMBER_ID: "123456",
        META_WABA_ID: "waba",
        WEBHOOK_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "secret",
      };
      return values[key] || "";
    }),
  };

  return new MetaWhatsAppAdapter(configService as any, {} as any);
}

describe("MetaWhatsAppAdapter media delivery", () => {
  it("sends product images as Meta image messages, not URL text", async () => {
    const adapter = createAdapter();
    const sendMessage = jest
      .spyOn(adapter, "sendMessage")
      .mockResolvedValue(undefined);
    const sendMediaMessage = jest
      .spyOn(adapter, "sendMediaMessage")
      .mockResolvedValue({ success: true, messageId: "wamid.media" });

    await adapter.sendMedia("201000000000", {
      text: "الصورة مرفقة مع الرسالة.",
      media: [
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
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "201000000000",
      "الصورة مرفقة مع الرسالة.",
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("https://cdn.example.com"),
    );
    expect(sendMediaMessage).toHaveBeenCalledTimes(2);
    expect(sendMediaMessage).toHaveBeenNthCalledWith(
      1,
      "201000000000",
      "https://cdn.example.com/product-1.jpg",
      "صورة المنتج الأولى",
    );
    expect(sendMediaMessage).toHaveBeenNthCalledWith(
      2,
      "201000000000",
      "https://cdn.example.com/product-2.jpg",
      "صورة المنتج الثانية",
    );
  });

  it("sends fallback text only when Meta rejects media", async () => {
    const adapter = createAdapter();
    const sendMessage = jest
      .spyOn(adapter, "sendMessage")
      .mockResolvedValue(undefined);
    jest.spyOn(adapter, "sendMediaMessage").mockResolvedValue({
      success: false,
      errorCode: "131000",
      errorMessage: "Media download failed",
    });

    await adapter.sendMedia("201000000000", {
      text: "الصورة مرفقة مع الرسالة.",
      media: [
        {
          url: "https://cdn.example.com/product.jpg",
          caption: "كابشن المنتج",
          fallbackText: "لو الصورة ما وصلتش: كابشن المنتج",
        },
      ],
    });

    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      "201000000000",
      "الصورة مرفقة مع الرسالة.",
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      "201000000000",
      "لو الصورة ما وصلتش: كابشن المنتج",
    );
  });
});
