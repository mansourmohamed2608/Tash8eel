# Phase 9 - Concrete Patches (Proposed)

> Patches below are **proposed** and **not applied**. Each patch includes a verification step.

## Patch 1 - Enforce Merchant Scope in MerchantApiKeyGuard (P0)

**Why**: Prevent cross-tenant access when `merchantId` path param is provided.

```diff
*** a/apps/api/src/shared/guards/merchant-api-key.guard.ts
--- b/apps/api/src/shared/guards/merchant-api-key.guard.ts
@@
-import {
-  Injectable,
-  CanActivate,
-  ExecutionContext,
-  UnauthorizedException,
-  Inject,
-} from '@nestjs/common';
+import {
+  Injectable,
+  CanActivate,
+  ExecutionContext,
+  UnauthorizedException,
+  ForbiddenException,
+  Inject,
+} from '@nestjs/common';
@@
       if (merchantResult.rows.length > 0) {
         (request as any).merchantId = merchantResult.rows[0].id;
+        this.enforceMerchantScope(request);
         return true;
       }
@@
       if (directResult.rows.length > 0) {
         const merchant = directResult.rows[0];
@@
         (request as any).merchantId = merchant.id;
         (request as any).apiKeyScopes = ['*']; // Full access for direct API keys
-
+        this.enforceMerchantScope(request);
         return true;
       }
@@
     // Attach merchant info to the request for downstream use
     (request as any).merchantId = apiKeyRecord.merchant_id;
     (request as any).apiKeyScopes = apiKeyRecord.scopes;
+    this.enforceMerchantScope(request);

     return true;
   }
+
+  private enforceMerchantScope(request: Request): void {
+    const paramMerchantId = (request.params || {}).merchantId;
+    const authMerchantId = (request as any).merchantId;
+
+    if (paramMerchantId && authMerchantId && paramMerchantId !== authMerchantId) {
+      throw new ForbiddenException('Merchant scope mismatch.');
+    }
+  }
 }
```

**Verify**:

1. Call `/api/merchants/{otherMerchantId}/analytics/*` with a valid key from another merchant and confirm 403.
2. Existing merchant-scoped calls with correct `merchantId` still succeed.

---

## Patch 2 - Guard Admin Early-Access Endpoint (P1)

**Why**: `/admin/early-access` currently has no admin guard.

```diff
*** a/apps/api/src/api/controllers/early-access.controller.ts
--- b/apps/api/src/api/controllers/early-access.controller.ts
@@
-import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
+import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, HttpStatus, BadRequestException, UseGuards } from '@nestjs/common';
 import { Inject } from '@nestjs/common';
 import { Pool } from 'pg';
 import { DATABASE_POOL } from '../../infrastructure/database/database.module';
 import { MerchantAuth } from '../../shared/guards/merchant-auth.guard';
-import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
+import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
+import { AdminApiKeyGuard } from '../../shared/guards/admin-api-key.guard';
@@
   // Admin endpoint to get all waitlist signups
   @Get('admin/early-access')
+  @UseGuards(AdminApiKeyGuard)
+  @ApiHeader({ name: 'x-admin-api-key', required: true, description: 'Admin API key' })
   @ApiOperation({ summary: 'Get all early access signups (admin)' })
   async getAllSignups(
```

**Verify**:

1. Call `/api/admin/early-access` without `x-admin-api-key` -> 401.
2. Call with valid admin key -> 200.

---

## Patch 3 - Require Twilio Signature When Validation Enabled (P1)

**Why**: Missing signature header bypasses validation.

```diff
*** a/apps/api/src/api/controllers/twilio-webhook.controller.ts
--- b/apps/api/src/api/controllers/twilio-webhook.controller.ts
@@
-      // Validate signature if enabled
-      if (this.validateSignature && twilioSignature) {
-        const fullUrl = this.getFullUrl(req);
-        const isValid = this.twilioAdapter.validateSignature(twilioSignature, fullUrl, payload as unknown as Record<string, string>);
-
-        if (!isValid) {
-          this.logger.warn({ msg: 'Invalid Twilio signature', correlationId, messageSid: payload.MessageSid });
-          res.status(401).send('Invalid signature');
-          return;
-        }
-      }
+      // Validate signature if enabled
+      if (this.validateSignature) {
+        if (!twilioSignature) {
+          this.logger.warn({ msg: 'Missing Twilio signature', correlationId, messageSid: payload.MessageSid });
+          res.status(401).send('Missing signature');
+          return;
+        }
+
+        const fullUrl = this.getFullUrl(req);
+        const isValid = this.twilioAdapter.validateSignature(twilioSignature, fullUrl, payload as unknown as Record<string, string>);
+
+        if (!isValid) {
+          this.logger.warn({ msg: 'Invalid Twilio signature', correlationId, messageSid: payload.MessageSid });
+          res.status(401).send('Invalid signature');
+          return;
+        }
+      }
```

**Verify**:

1. Send webhook without signature when `TWILIO_VALIDATE_SIGNATURE=true` -> 401.
2. Send valid signed request -> 200.

---

## Patch 4 - Add CSV Upload Limits + Remove Raw CSV Logging (P1)

**Why**: CSV imports are in-memory with no size limits; raw CSV logged (PII risk).

```diff
*** a/apps/api/src/api/controllers/production-features.controller.ts
--- b/apps/api/src/api/controllers/production-features.controller.ts
@@
-import { FileInterceptor } from '@nestjs/platform-express';
+import { FileInterceptor } from '@nestjs/platform-express';
@@
-@ApiTags('Production Features')
+const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
+
+@ApiTags('Production Features')
 @Controller('v1/portal')
@@
-  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
+  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_SIZE_BYTES } }))
   async importProducts(
@@
-    // Read CSV content from file buffer
-    const csvData = file.buffer.toString('utf-8');
-
-    console.log('CSV Data received:', csvData.substring(0, 200)); // Debug log
+    if (!file.originalname.endsWith('.csv') && !file.mimetype.includes('csv')) {
+      throw new BadRequestException('CSV file required');
+    }
+
+    // Read CSV content from file buffer
+    const csvData = file.buffer.toString('utf-8');
@@
-  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
+  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_SIZE_BYTES } }))
   @ApiConsumes('multipart/form-data')
   async importCustomers(
@@
-    if (file) {
+    if (file) {
+      if (!file.originalname.endsWith('.csv') && !file.mimetype.includes('csv')) {
+        throw new BadRequestException('CSV file required');
+      }
       csvData = file.buffer.toString('utf-8');
@@
-  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
+  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_SIZE_BYTES } }))
   @ApiConsumes('multipart/form-data')
   async importInventory(
@@
-    if (!file) {
+    if (!file) {
       throw new BadRequestException('CSV file is required');
     }
+
+    if (!file.originalname.endsWith('.csv') && !file.mimetype.includes('csv')) {
+      throw new BadRequestException('CSV file required');
+    }
```

**Verify**:

1. Upload >5MB file -> 413 or 400.
2. Upload non-CSV file -> 400.
3. CSV import works with valid files; no CSV content in logs.

---

## Patch 5 - Fix Duplicate Portal Notification Methods (P1)

**Why**: Duplicate object keys in `portalApi` override portal-level notification methods.

```diff
*** a/apps/portal/src/lib/authenticated-api.ts
--- b/apps/portal/src/lib/authenticated-api.ts
@@
-  // Notifications (portal-level)
-  getNotifications: (params?: { unreadOnly?: boolean }) => {
+  // Notifications (portal-level)
+  getPortalNotifications: (params?: { unreadOnly?: boolean }) => {
     const query = new URLSearchParams();
     if (params?.unreadOnly) query.set('unreadOnly', 'true');
     return authenticatedFetch<any>(`/api/v1/portal/notifications?${query}`);
   },

-  markNotificationRead: (notificationId: string) =>
+  markPortalNotificationRead: (notificationId: string) =>
     authenticatedFetch<any>(`/api/v1/portal/notifications/${notificationId}/read`, {
       method: 'PUT',
     }),

-  markAllNotificationsRead: () =>
+  markAllPortalNotificationsRead: () =>
     authenticatedFetch<any>('/api/v1/portal/notifications/read-all', {
       method: 'PUT',
     }),

-  deleteNotification: (notificationId: string) =>
+  deletePortalNotification: (notificationId: string) =>
     authenticatedFetch<any>(`/api/v1/portal/notifications/${notificationId}`, {
       method: 'DELETE',
     }),
```

```diff
*** a/apps/portal/src/components/layout/notifications-popover.tsx
--- b/apps/portal/src/components/layout/notifications-popover.tsx
@@
-      const response = await portalApi.getNotifications();
+      const response = await portalApi.getPortalNotifications();
@@
-      await portalApi.markNotificationRead(id);
+      await portalApi.markPortalNotificationRead(id);
@@
-      await portalApi.markAllNotificationsRead();
+      await portalApi.markAllPortalNotificationsRead();
@@
-      await portalApi.deleteNotification(id);
+      await portalApi.deletePortalNotification(id);
```

**Verify**:

1. Open notifications popover in portal header; ensure it loads and actions work.
2. Merchant notifications page continues using merchant-level methods.

---

## Patch 6 - Fix Loyalty Controller Path (P2)

**Why**: Global prefix `/api` + controller path `api/merchants/...` yields `/api/api/...`.

```diff
*** a/apps/api/src/api/controllers/loyalty.controller.ts
--- b/apps/api/src/api/controllers/loyalty.controller.ts
@@
-@Controller('api/merchants/:merchantId/loyalty')
+@Controller('merchants/:merchantId/loyalty')
 export class LoyaltyController {
```

**Verify**:

1. Call `/api/merchants/:merchantId/loyalty/tiers` and confirm 200.
