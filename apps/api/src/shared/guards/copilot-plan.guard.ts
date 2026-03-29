import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

@Injectable()
export class CopilotPlanGuard implements CanActivate {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const merchantId = request?.merchantId;

    if (!merchantId) {
      return true;
    }

    const result = await this.pool.query<{ plan_name: string | null }>(
      `WITH current_plan AS (
         SELECT LOWER(COALESCE(NULLIF(p.name, ''), NULLIF(p.code, ''), 'starter')) AS plan_name,
                s.created_at
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.merchant_id = $1
           AND s.status = 'ACTIVE'
         UNION ALL
         SELECT LOWER(COALESCE(NULLIF(bp.name, ''), NULLIF(bp.code, ''), 'starter')) AS plan_name,
                ms.created_at
         FROM merchant_subscriptions ms
         JOIN billing_plans bp ON bp.id = ms.plan_id
         WHERE ms.merchant_id = $1
           AND ms.status = 'ACTIVE'
       )
       SELECT plan_name
       FROM current_plan
       ORDER BY created_at DESC
       LIMIT 1`,
      [merchantId],
    );

    const planName = result.rows[0]?.plan_name;
    if (!planName) {
      return true;
    }

    if (planName === "starter") {
      throw new ForbiddenException(
        "هذه الميزة غير متاحة في باقتك. يرجى الترقية للوصول للكوبايلوت",
      );
    }

    return true;
  }
}
