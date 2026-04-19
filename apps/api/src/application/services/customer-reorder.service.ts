import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from "../../domain/ports/customer.repository";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../domain/ports/order.repository";

/**
 * Customer Reorder Service
 *
 * Handles customer WhatsApp reorder requests:
 * - "عايز نفس طلب المرة اللي فاتت"
 * - "كرر الطلب السابق"
 * - "نفس الطلب"
 */

export interface ReorderItem {
  catalogItemId: string;
  sku: string;
  name: string;
  nameAr: string;
  quantity: number;
  price: number;
  available: boolean;
  currentStock: number;
}

export interface ReorderCheckResult {
  success: boolean;
  hasLastOrder: boolean;
  lastOrderId?: string;
  lastOrderNumber?: string;
  lastOrderDate?: Date;
  items: ReorderItem[];
  allAvailable: boolean;
  unavailableItems: ReorderItem[];
  total: number;
  /** Pre-filled address from last order if available */
  address?: {
    city: string;
    area: string;
    street: string;
    full: string;
  };
  /** Customer phone for confirmation */
  customerPhone?: string;
  /** Error message in Arabic if failed */
  errorAr?: string;
}

export interface ReorderConfirmResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  total?: number;
  errorAr?: string;
}

@Injectable()
export class CustomerReorderService {
  private readonly logger = new Logger(CustomerReorderService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
  ) {}

  /**
   * Check if customer has a last order and verify inventory availability
   */
  async checkReorderAvailability(
    merchantId: string,
    customerPhone: string,
  ): Promise<ReorderCheckResult> {
    this.logger.log({
      msg: "Checking reorder availability",
      merchantId,
      customerPhone,
    });

    try {
      // 1. Find customer's last successful order
      const lastOrderResult = await this.pool.query(
        `SELECT o.id, o.order_number, o.total, o.items, o.created_at,
                o.shipping_address_city, o.shipping_address_area, 
                o.shipping_address_street, o.shipping_address_full,
                c.phone
         FROM orders o
         JOIN customers c ON o.customer_id = c.id
         WHERE o.merchant_id = $1
           AND c.phone = $2
           AND o.status IN ('DELIVERED', 'CONFIRMED', 'SHIPPED', 'OUT_FOR_DELIVERY')
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [merchantId, customerPhone],
      );

      if (lastOrderResult.rows.length === 0) {
        return {
          success: false,
          hasLastOrder: false,
          items: [],
          allAvailable: false,
          unavailableItems: [],
          total: 0,
          errorAr: "مفيش طلبات سابقة ليك. ممكن تقولي تحب تطلب ايه؟",
        };
      }

      const lastOrder = lastOrderResult.rows[0];
      const orderItems = lastOrder.items || [];

      if (!orderItems.length) {
        return {
          success: false,
          hasLastOrder: true,
          lastOrderId: lastOrder.id,
          lastOrderNumber: lastOrder.order_number,
          lastOrderDate: lastOrder.created_at,
          items: [],
          allAvailable: false,
          unavailableItems: [],
          total: 0,
          errorAr: "الطلب السابق مش فيه منتجات. ممكن تقولي تحب تطلب ايه؟",
        };
      }

      // 2. Check inventory availability for each item
      const reorderItems: ReorderItem[] = [];
      const unavailableItems: ReorderItem[] = [];

      for (const item of orderItems) {
        const catalogResult = await this.pool.query(
          `SELECT ci.id, ci.sku, ci.name, ci.name_ar, ci.price,
                  COALESCE(inv.quantity, 0) as current_stock
           FROM catalog_items ci
           LEFT JOIN inventory inv ON inv.catalog_item_id = ci.id
           WHERE ci.id = $1 AND ci.merchant_id = $2 AND ci.is_active = true`,
          [item.catalogItemId, merchantId],
        );

        if (catalogResult.rows.length === 0) {
          // Item no longer exists or is inactive
          unavailableItems.push({
            catalogItemId: item.catalogItemId,
            sku: item.sku || "",
            name: item.name,
            nameAr: item.nameAr || item.name,
            quantity: item.quantity,
            price: item.price,
            available: false,
            currentStock: 0,
          });
          continue;
        }

        const catalogItem = catalogResult.rows[0];
        const isAvailable = catalogItem.current_stock >= item.quantity;

        const reorderItem: ReorderItem = {
          catalogItemId: catalogItem.id,
          sku: catalogItem.sku,
          name: catalogItem.name,
          nameAr: catalogItem.name_ar || catalogItem.name,
          quantity: item.quantity,
          price: catalogItem.price, // Use current price
          available: isAvailable,
          currentStock: catalogItem.current_stock,
        };

        reorderItems.push(reorderItem);
        if (!isAvailable) {
          unavailableItems.push(reorderItem);
        }
      }

      // 3. Calculate total
      const total = reorderItems
        .filter((item) => item.available)
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

      // 4. Extract address from last order
      const address = lastOrder.shipping_address_full
        ? {
            city: lastOrder.shipping_address_city || "",
            area: lastOrder.shipping_address_area || "",
            street: lastOrder.shipping_address_street || "",
            full: lastOrder.shipping_address_full,
          }
        : undefined;

      return {
        success: true,
        hasLastOrder: true,
        lastOrderId: lastOrder.id,
        lastOrderNumber: lastOrder.order_number,
        lastOrderDate: lastOrder.created_at,
        items: reorderItems,
        allAvailable: unavailableItems.length === 0,
        unavailableItems,
        total,
        address,
        customerPhone: lastOrder.phone,
      };
    } catch (error) {
      this.logger.error({
        msg: "Reorder availability check failed",
        error: (error as Error).message,
        merchantId,
        customerPhone,
      });

      return {
        success: false,
        hasLastOrder: false,
        items: [],
        allAvailable: false,
        unavailableItems: [],
        total: 0,
        errorAr: "حصل مشكلة في التحقق من الطلب السابق. ممكن تحاول تاني؟",
      };
    }
  }

  /**
   * Generate Arabic confirmation message for reorder
   */
  generateReorderConfirmationMessage(result: ReorderCheckResult): string {
    if (!result.success || !result.hasLastOrder) {
      return result.errorAr || "مفيش طلبات سابقة ليك.";
    }

    let message = "📦 *طلبك السابق:*\n\n";

    // List available items
    const availableItems = result.items.filter((item) => item.available);
    for (const item of availableItems) {
      message += `• ${item.nameAr} × ${item.quantity} = ${item.price * item.quantity} ج.م\n`;
    }

    // Mention unavailable items
    if (result.unavailableItems.length > 0) {
      message += "\n⚠️ *مش متوفر دلوقتي:*\n";
      for (const item of result.unavailableItems) {
        if (item.currentStock > 0) {
          message += `• ${item.nameAr} (متوفر ${item.currentStock} بس)\n`;
        } else {
          message += `• ${item.nameAr} (نفذ)\n`;
        }
      }
    }

    message += `\n💰 *الإجمالي:* ${result.total} ج.م`;

    // Address confirmation
    if (result.address) {
      message += `\n\n📍 *العنوان:* ${result.address.full}`;
      message += "\n\nهل العنوان صح؟ لو محتاج تغيره ابعتلي العنوان الجديد.";
    } else {
      message += "\n\n📍 ابعتلي عنوان التوصيل من فضلك.";
    }

    message += '\n\n✅ رد بـ "تمام" أو "أكد" لتأكيد الطلب';

    return message;
  }

  /**
   * Create order from reorder confirmation
   */
  async confirmReorder(
    merchantId: string,
    customerPhone: string,
    address?: {
      city?: string;
      area?: string;
      street?: string;
      full?: string;
    },
  ): Promise<ReorderConfirmResult> {
    this.logger.log({
      msg: "Confirming reorder",
      merchantId,
      customerPhone,
    });

    try {
      // Get reorder availability (includes items and prices)
      const reorderCheck = await this.checkReorderAvailability(
        merchantId,
        customerPhone,
      );

      if (!reorderCheck.success || !reorderCheck.hasLastOrder) {
        return {
          success: false,
          errorAr: reorderCheck.errorAr || "مفيش طلبات سابقة ليك.",
        };
      }

      // Get only available items
      const availableItems = reorderCheck.items.filter(
        (item) => item.available,
      );
      if (availableItems.length === 0) {
        return {
          success: false,
          errorAr:
            "للأسف كل المنتجات اللي كانت في الطلب السابق مش متوفرة دلوقتي.",
        };
      }

      // Get customer ID
      const customerResult = await this.pool.query(
        `SELECT id FROM customers WHERE merchant_id = $1 AND phone = $2`,
        [merchantId, customerPhone],
      );

      if (customerResult.rows.length === 0) {
        return {
          success: false,
          errorAr: "حصل مشكلة في إيجاد بيانات العميل.",
        };
      }

      const customerId = customerResult.rows[0].id;

      // Use provided address or last order's address
      const finalAddress = address || reorderCheck.address || { full: "" };

      // Generate order number
      const orderNumber = `R${Date.now().toString(36).toUpperCase()}`;

      // Create order
      const orderItems = availableItems.map((item) => ({
        catalogItemId: item.catalogItemId,
        sku: item.sku,
        name: item.name,
        nameAr: item.nameAr,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      }));

      const total = orderItems.reduce((sum, item) => sum + item.total, 0);

      const orderResult = await this.pool.query(
        `INSERT INTO orders (
          merchant_id, customer_id, order_number, status, items, subtotal, total,
          shipping_address_city, shipping_address_area, shipping_address_street, shipping_address_full,
          source, created_at, updated_at
        ) VALUES ($1, $2, $3, 'CONFIRMED', $4, $5, $6, $7, $8, $9, $10, 'whatsapp_reorder', NOW(), NOW())
        RETURNING id, order_number, total`,
        [
          merchantId,
          customerId,
          orderNumber,
          JSON.stringify(orderItems),
          total,
          total,
          finalAddress.city || null,
          finalAddress.area || null,
          finalAddress.street || null,
          finalAddress.full || null,
        ],
      );

      const newOrder = orderResult.rows[0];

      // Decrement inventory
      for (const item of availableItems) {
        await this.pool.query(
          `UPDATE inventory 
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE catalog_item_id = $2 AND merchant_id = $3`,
          [item.quantity, item.catalogItemId, merchantId],
        );
      }

      this.logger.log({
        msg: "Reorder confirmed successfully",
        orderId: newOrder.id,
        orderNumber: newOrder.order_number,
        total: newOrder.total,
        itemCount: availableItems.length,
      });

      return {
        success: true,
        orderId: newOrder.id,
        orderNumber: newOrder.order_number,
        total: newOrder.total,
      };
    } catch (error) {
      this.logger.error({
        msg: "Reorder confirmation failed",
        error: (error as Error).message,
        merchantId,
        customerPhone,
      });

      return {
        success: false,
        errorAr: "حصل مشكلة في تأكيد الطلب. ممكن تحاول تاني؟",
      };
    }
  }

  /**
   * Detect if customer message is a reorder request
   */
  isReorderRequest(message: string): boolean {
    const reorderPatterns = [
      // Direct reorder phrases
      /نفس\s*(الطلب|طلب)/i,
      /كرر\s*(الطلب|طلبي)/i,
      /عايز\s*نفس/i,
      /اعمل\s*نفس\s*الطلب/i,
      /طلبي\s*السابق/i,
      /الطلب\s*اللي\s*فات/i,
      /المرة\s*اللي\s*فاتت/i,
      /الطلب\s*الأخير/i,
      /اطلب\s*زي\s*الاول/i,
      /نفس\s*المرة\s*اللي\s*فاتت/i,
      // Shorthand
      /^نفسه$/i,
      /^كرره$/i,
      /^زي\s*الاول$/i,
      /^نفس$/i,
    ];

    return reorderPatterns.some((pattern) => pattern.test(message.trim()));
  }
}
