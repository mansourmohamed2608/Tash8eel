import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OrderStatus } from "../../shared/constants/enums";

type DriverCommandAction = "PICKED_UP" | "DELIVERED";
type CustomerConfirmationAction = "CONFIRMED" | "DENIED";

interface DriverOrderRow {
  id: string;
  order_number: string | null;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  conversation_id: string | null;
}

interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  whatsapp_number: string | null;
}

interface ParsedDriverCommand {
  action: DriverCommandAction;
  orderHints: string[];
}

interface StatusTransition {
  allowed: boolean;
  orderStatus?: OrderStatus;
  shipmentStatus?: string;
  noteAr?: string;
  reasonAr?: string;
}

export interface DriverStatusCommandResult {
  handled: boolean;
  driverReply?: string;
  customerNotification?: {
    phone: string;
    message: string;
  };
  orderId?: string;
  orderNumber?: string;
}

@Injectable()
export class DriverStatusService {
  private readonly logger = new Logger(DriverStatusService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async processDriverMessage(params: {
    merchantId: string;
    senderId: string;
    text: string;
  }): Promise<DriverStatusCommandResult> {
    const parsedDriverCommand = this.parseDriverCommand(params.text);
    if (parsedDriverCommand) {
      try {
        const driver = await this.findDriverBySender(
          params.merchantId,
          params.senderId,
        );
        if (driver) {
          return this.handleDriverCommand(
            params.merchantId,
            driver.id,
            parsedDriverCommand,
          );
        }
      } catch (error) {
        this.logger.error({
          msg: "Failed to process driver status message",
          merchantId: params.merchantId,
          senderId: params.senderId,
          error: (error as Error).message,
        });
        return {
          handled: true,
          driverReply: "حصلت مشكلة أثناء تحديث الحالة. حاول مرة أخرى.",
        };
      }
    }

    try {
      const customerConfirmation =
        await this.processCustomerConfirmation(params);
      if (customerConfirmation) {
        return customerConfirmation;
      }
    } catch (error) {
      this.logger.error({
        msg: "Failed to process customer delivery confirmation",
        merchantId: params.merchantId,
        senderId: params.senderId,
        error: (error as Error).message,
      });
      return {
        handled: true,
        driverReply: "حصلت مشكلة أثناء التأكيد. حاول مرة أخرى.",
      };
    }

    return { handled: false };
  }

  private async handleDriverCommand(
    merchantId: string,
    driverId: string,
    parsed: ParsedDriverCommand,
  ): Promise<DriverStatusCommandResult> {
    const orders = await this.getDriverOrders(merchantId, driverId);
    if (orders.length === 0) {
      return {
        handled: true,
        driverReply: "لا يوجد لديك أي طلبات مُعيّنة حالياً.",
      };
    }

    const resolvedOrder = this.resolveTargetOrder(orders, parsed.orderHints);
    if (!resolvedOrder.order) {
      return {
        handled: true,
        driverReply: resolvedOrder.reasonAr || "تعذر تحديد الطلب المقصود.",
      };
    }

    const transition = this.resolveTransition(
      parsed.action,
      resolvedOrder.order.status,
    );
    if (
      !transition.allowed ||
      !transition.orderStatus ||
      !transition.shipmentStatus ||
      !transition.noteAr
    ) {
      return {
        handled: true,
        driverReply:
          transition.reasonAr || "لا يمكن تحديث حالة هذا الطلب الآن.",
      };
    }

    await this.applyStatusUpdate({
      merchantId,
      order: resolvedOrder.order,
      orderStatus: transition.orderStatus,
      shipmentStatus: transition.shipmentStatus,
      noteAr: transition.noteAr,
    });

    const orderNumber = this.displayOrderNumber(resolvedOrder.order);
    const customerPhone = String(
      resolvedOrder.order.customer_phone || "",
    ).trim();
    const customerName =
      String(resolvedOrder.order.customer_name || "").trim() || "عميلنا العزيز";

    const customerNotification = customerPhone
      ? {
          phone: customerPhone,
          message:
            parsed.action === "PICKED_UP"
              ? [
                  `🚚 طلبك ${orderNumber} أصبح مع السائق الآن.`,
                  `أهلاً ${customerName}، طلبك في الطريق إليك.`,
                ].join("\n")
              : [
                  `🚚 السائق أفاد أنه سلّم طلبك ${orderNumber}.`,
                  `أهلاً ${customerName}، للتأكيد فقط:`,
                  `إذا استلمت الطلب اكتب: نعم تم الاستلام`,
                  `إذا لم تستلم الطلب اكتب: لا لم أستلم`,
                ].join("\n"),
        }
      : undefined;

    return {
      handled: true,
      driverReply:
        parsed.action === "PICKED_UP"
          ? `تم تسجيل حالة الطلب ${orderNumber}: خرج للتسليم.`
          : `تم تسجيل التسليم المبدئي للطلب ${orderNumber} وإرسال تأكيد للعميل.`,
      customerNotification,
      orderId: resolvedOrder.order.id,
      orderNumber,
    };
  }

  private async processCustomerConfirmation(params: {
    merchantId: string;
    senderId: string;
    text: string;
  }): Promise<DriverStatusCommandResult | null> {
    const action = this.parseCustomerConfirmation(params.text);
    if (!action) {
      return null;
    }

    const pendingOrders = await this.getPendingCustomerConfirmationOrders(
      params.merchantId,
      params.senderId,
    );
    if (pendingOrders.length === 0) {
      return null;
    }

    const resolvedOrder = this.resolveTargetOrder(
      pendingOrders,
      this.extractOrderHints(params.text),
    );
    if (!resolvedOrder.order) {
      return {
        handled: true,
        driverReply: resolvedOrder.reasonAr || "حدّد رقم الطلب للتأكيد.",
      };
    }

    const order = resolvedOrder.order;
    const orderNumber = this.displayOrderNumber(order);

    if (action === "DENIED") {
      await this.applyStatusUpdate({
        merchantId: params.merchantId,
        order,
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        shipmentStatus: "delivery_disputed",
        noteAr: "العميل أفاد بعدم استلام الطلب عبر واتساب",
      });

      return {
        handled: true,
        driverReply: `تم تسجيل أنك لم تستلم الطلب ${orderNumber}. سيتم متابعة الحالة فوراً.`,
        orderId: order.id,
        orderNumber,
      };
    }

    await this.applyStatusUpdate({
      merchantId: params.merchantId,
      order,
      orderStatus: OrderStatus.DELIVERED,
      shipmentStatus: "delivered",
      noteAr: "تم تأكيد الاستلام من العميل عبر واتساب",
    });

    return {
      handled: true,
      driverReply: `شكراً لتأكيدك. تم إغلاق الطلب ${orderNumber} كـ "تم التسليم".`,
      orderId: order.id,
      orderNumber,
    };
  }

  private parseDriverCommand(text: string): ParsedDriverCommand | null {
    const normalized = this.normalizeArabicText(text);
    if (!normalized) return null;

    const isDelivered =
      /(?:^|\s)(?:تم\s+التسليم|تم\s+تسليم(?:\s+الطلب)?|سلمت(?:\s+الطلب)?)(?:\s|$)/.test(
        normalized,
      );
    const isPickedUp =
      /(?:^|\s)(?:تم\s+الاستلام|تم\s+استلام(?:\s+الطلب)?|استلمت(?:\s+الطلب)?)(?:\s|$)/.test(
        normalized,
      );

    if (!isDelivered && !isPickedUp) return null;

    return {
      action: isDelivered ? "DELIVERED" : "PICKED_UP",
      orderHints: this.extractOrderHints(text),
    };
  }

  private parseCustomerConfirmation(
    text: string,
  ): CustomerConfirmationAction | null {
    const normalized = this.normalizeArabicText(text);
    if (!normalized) return null;

    const denied =
      /(?:^|\s)(?:لسه|لسا|ما\s*وصل|مو\s*وصل|لم\s*يصل|ما\s*استلمت|لم\s*استلم|مش\s*استلم|لا\s*لم\s*استلم)(?:\s|$)/.test(
        normalized,
      );
    if (denied) return "DENIED";

    const confirmed =
      /(?:^|\s)(?:نعم|ايوه|ايوة|ايوا|تم\s*الاستلام|استلمت|وصل|وصلني|تم\s*التسليم)(?:\s|$)/.test(
        normalized,
      );
    if (confirmed) return "CONFIRMED";

    return null;
  }

  private normalizeArabicText(text: string): string {
    return String(text || "")
      .toLowerCase()
      .replace(/[إأآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[^\u0621-\u064A0-9a-z\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractOrderHints(text: string): string[] {
    const source = String(text || "");
    const hints = new Set<string>();

    const scopedRegex =
      /(?:رقم\s*الطلب|طلب|order)\s*[:#-]?\s*([A-Za-z0-9-]{3,})/gi;
    let scopedMatch: RegExpExecArray | null;
    while ((scopedMatch = scopedRegex.exec(source)) !== null) {
      hints.add(scopedMatch[1].toLowerCase());
    }

    const generalRegex = /\b([A-Za-z]{2,}-\d[\w-]*|\d{3,})\b/g;
    let generalMatch: RegExpExecArray | null;
    while ((generalMatch = generalRegex.exec(source)) !== null) {
      hints.add(generalMatch[1].toLowerCase());
    }

    return Array.from(hints);
  }

  private async findDriverBySender(
    merchantId: string,
    senderId: string,
  ): Promise<DriverRow | null> {
    const senderDigits = this.extractDigits(senderId);
    if (!senderDigits) return null;

    const result = await this.pool.query<DriverRow>(
      `SELECT id, name, phone, whatsapp_number
       FROM delivery_drivers
       WHERE merchant_id = $1
         AND status = 'ACTIVE'
         AND (
           RIGHT(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g'), 11) = RIGHT($2, 11)
           OR RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 11) = RIGHT($2, 11)
         )
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [merchantId, senderDigits],
    );

    return result.rows[0] || null;
  }

  private extractDigits(value: string): string {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("00") ? digits.slice(2) : digits;
  }

  private async getDriverOrders(
    merchantId: string,
    driverId: string,
  ): Promise<DriverOrderRow[]> {
    const result = await this.pool.query<DriverOrderRow>(
      `SELECT id, order_number, status, customer_name, customer_phone, conversation_id
       FROM orders
       WHERE merchant_id = $1
         AND assigned_driver_id = $2
         AND status IN ('CONFIRMED', 'BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED')
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 20`,
      [merchantId, driverId],
    );

    return result.rows;
  }

  private async getPendingCustomerConfirmationOrders(
    merchantId: string,
    senderId: string,
  ): Promise<DriverOrderRow[]> {
    const senderDigits = this.extractDigits(senderId);
    if (!senderDigits) return [];

    const result = await this.pool.query<DriverOrderRow>(
      `SELECT o.id, o.order_number, o.status, o.customer_name, o.customer_phone, o.conversation_id
       FROM orders o
       JOIN shipments s ON s.order_id = o.id AND s.merchant_id = o.merchant_id
       WHERE o.merchant_id = $1
         AND RIGHT(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), 11) = RIGHT($2, 11)
         AND o.status::text IN ('CONFIRMED', 'BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY')
         AND LOWER(COALESCE(s.status, '')) IN ('delivered_pending_confirmation', 'delivery_disputed')
       ORDER BY o.updated_at DESC, o.created_at DESC
       LIMIT 20`,
      [merchantId, senderDigits],
    );

    return result.rows;
  }

  private resolveTargetOrder(
    orders: DriverOrderRow[],
    hints: string[],
  ): { order: DriverOrderRow | null; reasonAr?: string } {
    if (hints.length > 0) {
      const matches = orders.filter((order) =>
        hints.some((hint) => this.matchesOrderHint(order, hint)),
      );
      if (matches.length === 1) return { order: matches[0] };
      if (matches.length > 1) {
        return {
          order: null,
          reasonAr: `الرقم غير واضح. الطلبات المطابقة: ${matches
            .slice(0, 3)
            .map((o) => this.displayOrderNumber(o))
            .join("، ")}.`,
        };
      }
      return {
        order: null,
        reasonAr: "لم أجد طلباً بهذا الرقم. اكتب مثلاً: تم التسليم للطلب 12345",
      };
    }

    const activeOrders = orders.filter(
      (o) => o.status !== OrderStatus.DELIVERED,
    );
    if (activeOrders.length === 1) {
      return { order: activeOrders[0] };
    }

    if (activeOrders.length === 0) {
      return {
        order: null,
        reasonAr: "لا يوجد طلب نشط لتحديثه حالياً.",
      };
    }

    return {
      order: null,
      reasonAr: `عندك أكثر من طلب نشط. اكتب رقم الطلب داخل الرسالة مثل: تم الاستلام للطلب ${this.displayOrderNumber(
        activeOrders[0],
      )}`,
    };
  }

  private matchesOrderHint(order: DriverOrderRow, hint: string): boolean {
    const normalizedHint = String(hint || "").toLowerCase();
    if (!normalizedHint) return false;

    const orderNumber = String(order.order_number || "").toLowerCase();
    const orderId = String(order.id || "").toLowerCase();

    if (
      orderNumber &&
      (orderNumber === normalizedHint || orderNumber.includes(normalizedHint))
    ) {
      return true;
    }

    if (orderId.startsWith(normalizedHint)) {
      return true;
    }

    const hintDigits = normalizedHint.replace(/\D/g, "");
    if (!hintDigits) return false;

    const orderNumberDigits = orderNumber.replace(/\D/g, "");
    const orderIdDigits = orderId.replace(/\D/g, "");
    return (
      orderNumberDigits.endsWith(hintDigits) ||
      orderIdDigits.startsWith(hintDigits)
    );
  }

  private resolveTransition(
    action: DriverCommandAction,
    currentStatus: string,
  ): StatusTransition {
    const current = String(currentStatus || "").toUpperCase();

    if (action === "PICKED_UP") {
      if (current === OrderStatus.OUT_FOR_DELIVERY) {
        return {
          allowed: false,
          reasonAr: "حالة الطلب مسجلة بالفعل: خرج للتسليم.",
        };
      }
      if (current === OrderStatus.DELIVERED) {
        return { allowed: false, reasonAr: "هذا الطلب مُسلم بالفعل." };
      }
      if (
        ![
          OrderStatus.CONFIRMED,
          OrderStatus.BOOKED,
          OrderStatus.SHIPPED,
        ].includes(current as OrderStatus)
      ) {
        return {
          allowed: false,
          reasonAr: "لا يمكن تسجيل الاستلام لهذه الحالة.",
        };
      }
      return {
        allowed: true,
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        shipmentStatus: "out_for_delivery",
        noteAr: "تم الاستلام من السائق عبر واتساب",
      };
    }

    if (current === OrderStatus.DELIVERED) {
      return {
        allowed: false,
        reasonAr: "حالة الطلب مسجلة بالفعل: تم التسليم.",
      };
    }
    if (
      ![
        OrderStatus.CONFIRMED,
        OrderStatus.BOOKED,
        OrderStatus.SHIPPED,
        OrderStatus.OUT_FOR_DELIVERY,
      ].includes(current as OrderStatus)
    ) {
      return { allowed: false, reasonAr: "لا يمكن تسجيل التسليم لهذه الحالة." };
    }
    return {
      allowed: true,
      // Do not close as delivered until customer confirms.
      orderStatus: OrderStatus.OUT_FOR_DELIVERY,
      shipmentStatus: "delivered_pending_confirmation",
      noteAr: "تم إبلاغ التسليم من السائق وينتظر تأكيد العميل",
    };
  }

  private async applyStatusUpdate(params: {
    merchantId: string;
    order: DriverOrderRow;
    orderStatus: OrderStatus;
    shipmentStatus: string;
    noteAr: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE orders
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND merchant_id = $3`,
        [params.orderStatus, params.order.id, params.merchantId],
      );

      try {
        const shipmentUpdate = await client.query(
          `UPDATE shipments
           SET status = $1,
               updated_at = NOW(),
               actual_delivery = CASE
                 WHEN $1 = 'delivered' THEN COALESCE(actual_delivery, NOW())
                 ELSE actual_delivery
               END,
               status_history = CASE
                 WHEN status_history IS NULL THEN jsonb_build_array(
                   jsonb_build_object('status', $1, 'at', NOW(), 'note', $2)
                 )
                 WHEN jsonb_typeof(status_history) = 'array' THEN status_history || jsonb_build_array(
                   jsonb_build_object('status', $1, 'at', NOW(), 'note', $2)
                 )
                 ELSE jsonb_build_array(
                   status_history,
                   jsonb_build_object('status', $1, 'at', NOW(), 'note', $2)
                 )
               END
           WHERE order_id = $3 AND merchant_id = $4
           RETURNING id`,
          [
            params.shipmentStatus,
            params.noteAr,
            params.order.id,
            params.merchantId,
          ],
        );

        if ((shipmentUpdate.rowCount || 0) === 0) {
          await client.query(
            `INSERT INTO shipments (order_id, merchant_id, status, status_history, actual_delivery, created_at, updated_at)
             VALUES (
               $1,
               $2,
               $3,
               jsonb_build_array(jsonb_build_object('status', $3, 'at', NOW(), 'note', $4)),
               CASE WHEN $3 = 'delivered' THEN NOW() ELSE NULL END,
               NOW(),
               NOW()
             )
             ON CONFLICT (order_id) DO UPDATE
             SET status = EXCLUDED.status,
                 updated_at = NOW(),
                 actual_delivery = CASE
                   WHEN EXCLUDED.status = 'delivered' THEN COALESCE(shipments.actual_delivery, NOW())
                   ELSE shipments.actual_delivery
                 END,
                 status_history = CASE
                   WHEN shipments.status_history IS NULL THEN EXCLUDED.status_history
                   WHEN jsonb_typeof(shipments.status_history) = 'array' THEN shipments.status_history || EXCLUDED.status_history
                   ELSE jsonb_build_array(
                     shipments.status_history,
                     jsonb_build_object('status', EXCLUDED.status, 'at', NOW(), 'note', $4)
                   )
                 END`,
            [
              params.order.id,
              params.merchantId,
              params.shipmentStatus,
              params.noteAr,
            ],
          );
        }
      } catch (shipmentError: any) {
        if (
          shipmentError?.code !== "42703" &&
          shipmentError?.code !== "42P01"
        ) {
          throw shipmentError;
        }
      }

      if (
        params.orderStatus === OrderStatus.DELIVERED &&
        params.order.conversation_id
      ) {
        await client.query(
          `UPDATE conversations
           SET state = 'CLOSED', updated_at = NOW()
           WHERE id = $1 AND merchant_id = $2`,
          [params.order.conversation_id, params.merchantId],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private displayOrderNumber(order: DriverOrderRow): string {
    const orderNumber = String(order.order_number || "").trim();
    if (orderNumber.length > 0) {
      return orderNumber;
    }
    return `#${String(order.id || "").slice(0, 8)}`;
  }
}
