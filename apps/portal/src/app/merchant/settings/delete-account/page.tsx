"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMerchant } from "@/hooks/use-merchant";
import { merchantApi } from "@/lib/client";

type DeletionRequest = {
  id: string;
  merchantId: string;
  requestedByStaffId: string;
  requestedAt: string;
  scheduledFor: string;
  status: "PENDING" | "CANCELLED" | "COMPLETED";
} | null;

export default function DeleteAccountPage() {
  const { apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<DeletionRequest>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const loadRequest = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await merchantApi.getDeletionRequest(apiKey);
      setPendingRequest(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل في تحميل الطلب");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const handleCreate = async () => {
    if (!apiKey) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await merchantApi.createDeletionRequest(apiKey);
      setSuccess(result.message);
      setShowConfirmDialog(false);
      setConfirmationText("");
      await loadRequest();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في إنشاء طلب حذف الحساب",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!apiKey || !pendingRequest) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await merchantApi.cancelDeletionRequest(
        apiKey,
        pendingRequest.id,
      );
      setSuccess(result.message);
      await loadRequest();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في إلغاء طلب حذف الحساب",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="حذف الحساب"
        description="سيتم حذف جميع البيانات نهائياً بعد 30 يوماً من تقديم الطلب."
      />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>تحذير</CardTitle>
          <CardDescription>
            هذا الإجراء يطلب حذف بيانات المتجر بالكامل بعد فترة انتظار مدتها 30
            يوماً. يمكن إلغاء الطلب قبل موعد التنفيذ فقط.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlertBanner
            type="warning"
            title="فترة انتظار إلزامية"
            message="سيظل الحساب متاحاً خلال فترة الانتظار. بعد الموعد المحدد سيتم حذف البيانات نهائياً."
          />

          {error ? (
            <AlertBanner
              type="error"
              title="تعذر تنفيذ الطلب"
              message={error}
            />
          ) : null}

          {success ? (
            <AlertBanner
              type="success"
              title="تم تحديث الحالة"
              message={success}
            />
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">
              جارٍ تحميل الحالة...
            </p>
          ) : pendingRequest ? (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">يوجد طلب حذف معلق</p>
                <p className="text-sm text-muted-foreground">
                  تاريخ التقديم:{" "}
                  {new Date(pendingRequest.requestedAt).toLocaleString("ar-EG")}
                </p>
                <p className="text-sm text-muted-foreground">
                  التنفيذ المجدول:{" "}
                  {new Date(pendingRequest.scheduledFor).toLocaleString(
                    "ar-EG",
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  onClick={() => void handleCancel()}
                  disabled={submitting}
                >
                  إلغاء طلب الحذف
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/merchant/settings">العودة إلى الإعدادات</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">
                لتأكيد بدء عملية حذف الحساب، اكتب{" "}
                <span className="font-semibold text-foreground">DELETE</span>.
              </p>
              <Input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder="اكتب DELETE"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  disabled={
                    submitting ||
                    confirmationText.trim().toUpperCase() !== "DELETE"
                  }
                  onClick={() => setShowConfirmDialog(true)}
                >
                  طلب حذف الحساب
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/merchant/settings">العودة إلى الإعدادات</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد طلب حذف الحساب</DialogTitle>
            <DialogDescription>
              سيتم إنشاء طلب حذف مؤجل لمدة 30 يوماً. خلال هذه الفترة يمكنك
              إلغاؤه من نفس الصفحة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={submitting}
            >
              رجوع
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleCreate()}
              disabled={submitting}
            >
              تأكيد الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
