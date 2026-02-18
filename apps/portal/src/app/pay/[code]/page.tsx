"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Smartphone,
  Building2,
  Wallet,
  Copy,
  Check,
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface PayoutDetails {
  instapay: { alias: string } | null;
  vodafoneCash: { number: string } | null;
  bankTransfer: {
    bankName: string;
    accountHolder: string | null;
    accountNumber: string | null;
    iban: string | null;
  } | null;
  preferredMethod: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
  merchantName: string;
}

interface PaymentLinkData {
  linkCode: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  expiresAt: string;
  customerName: string | null;
  allowedMethods: string[];
  isPaid: boolean;
  isExpired: boolean;
  payoutDetails: PayoutDetails;
  proofInstructionAr: string;
}

export default function PaymentPage() {
  const params = useParams();
  const code = params?.code as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PaymentLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("INSTAPAY");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchPaymentLink = async () => {
      if (!code) return;

      try {
        const res = await fetch(`/api/v1/payments/pay/${code}`);
        if (!res.ok) {
          throw new Error("رابط الدفع غير موجود أو منتهي الصلاحية");
        }
        const result = await res.json();
        setData(result);

        // Set initial method based on preferred
        if (result.payoutDetails?.preferredMethod) {
          setSelectedMethod(result.payoutDetails.preferredMethod);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ");
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentLink();
  }, [code]);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofImage(e.target.files[0]);
    }
  };

  const handleSubmitProof = async () => {
    if (!proofImage && !referenceNumber) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      if (proofImage) payload.append("proofImage", proofImage);
      if (referenceNumber) payload.append("referenceNumber", referenceNumber);
      if (selectedMethod) payload.append("proofType", selectedMethod);
      const res = await fetch(`/api/v1/payments/pay/${code}/proof`, {
        method: "POST",
        body: payload,
      });

      if (!res.ok) {
        throw new Error("فشل في إرسال الإيصال");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">رابط غير صالح</h2>
            <p className="text-muted-foreground">
              {error || "رابط الدفع غير موجود"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.isPaid) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">تم الدفع بنجاح ✅</h2>
            <p className="text-muted-foreground">شكراً لك! تم استلام الدفع.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.isExpired) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Clock className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">انتهت صلاحية الرابط</h2>
            <p className="text-muted-foreground">
              تواصل مع البائع للحصول على رابط جديد.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">تم إرسال الإيصال ✅</h2>
            <p className="text-muted-foreground">
              شكراً! سيتم مراجعة الإيصال وتأكيد الدفع قريباً.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const payout = data.payoutDetails;
  const hasInstapay = !!payout.instapay;
  const hasVodafone = !!payout.vodafoneCash;
  const hasBank = !!payout.bankTransfer;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4" dir="rtl">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Amount Card */}
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-white">
          <CardContent className="pt-6 text-center">
            <p className="text-sm opacity-80">المبلغ المطلوب</p>
            <p className="text-4xl font-bold my-2">
              {data.amount.toLocaleString("ar-EG")} {data.currency}
            </p>
            {data.customerName && (
              <p className="text-sm opacity-80">مرحباً {data.customerName}</p>
            )}
            {data.description && (
              <p className="text-sm mt-2 opacity-90">{data.description}</p>
            )}
            <p className="text-sm mt-4 opacity-80">
              إلى: {payout.merchantName}
            </p>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">اختر طريقة الدفع</CardTitle>
            <CardDescription>
              حوّل المبلغ باستخدام أي طريقة من الطرق التالية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedMethod} onValueChange={setSelectedMethod}>
              <TabsList className="grid w-full grid-cols-3">
                {hasInstapay && (
                  <TabsTrigger
                    value="INSTAPAY"
                    className="flex items-center gap-1"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span className="hidden sm:inline">إنستاباي</span>
                  </TabsTrigger>
                )}
                {hasVodafone && (
                  <TabsTrigger
                    value="VODAFONE_CASH"
                    className="flex items-center gap-1"
                  >
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">ڤودافون كاش</span>
                  </TabsTrigger>
                )}
                {hasBank && (
                  <TabsTrigger
                    value="BANK_TRANSFER"
                    className="flex items-center gap-1"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">تحويل بنكي</span>
                  </TabsTrigger>
                )}
              </TabsList>

              {/* InstaPay Details */}
              {hasInstapay && (
                <TabsContent value="INSTAPAY" className="mt-4 space-y-4">
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      حوّل على إنستاباي:
                    </p>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3">
                      <span className="font-mono text-lg font-bold" dir="ltr">
                        {payout.instapay!.alias}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(payout.instapay!.alias, "instapay")
                        }
                      >
                        {copiedField === "instapay" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>1. افتح تطبيق البنك بتاعك</p>
                    <p>2. اختار إنستاباي</p>
                    <p>
                      3. حوّل على الاسم ده:{" "}
                      <strong>{payout.instapay!.alias}</strong>
                    </p>
                    <p>
                      4. المبلغ:{" "}
                      <strong>
                        {data.amount} {data.currency}
                      </strong>
                    </p>
                  </div>
                </TabsContent>
              )}

              {/* Vodafone Cash Details */}
              {hasVodafone && (
                <TabsContent value="VODAFONE_CASH" className="mt-4 space-y-4">
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      حوّل على ڤودافون كاش:
                    </p>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3">
                      <span className="font-mono text-lg font-bold" dir="ltr">
                        {payout.vodafoneCash!.number}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            payout.vodafoneCash!.number,
                            "vodafone",
                          )
                        }
                      >
                        {copiedField === "vodafone" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>1. اتصل بـ *9*</p>
                    <p>2. اختار تحويل فلوس</p>
                    <p>
                      3. ادخل الرقم:{" "}
                      <strong dir="ltr">{payout.vodafoneCash!.number}</strong>
                    </p>
                    <p>
                      4. المبلغ:{" "}
                      <strong>
                        {data.amount} {data.currency}
                      </strong>
                    </p>
                  </div>
                </TabsContent>
              )}

              {/* Bank Transfer Details */}
              {hasBank && (
                <TabsContent value="BANK_TRANSFER" className="mt-4 space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      بيانات التحويل البنكي:
                    </p>

                    <div className="bg-white rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          البنك:
                        </span>
                        <span className="font-medium">
                          {payout.bankTransfer!.bankName}
                        </span>
                      </div>

                      {payout.bankTransfer!.accountHolder && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            اسم صاحب الحساب:
                          </span>
                          <span className="font-medium">
                            {payout.bankTransfer!.accountHolder}
                          </span>
                        </div>
                      )}

                      {payout.bankTransfer!.accountNumber && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            رقم الحساب:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono" dir="ltr">
                              {payout.bankTransfer!.accountNumber}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                copyToClipboard(
                                  payout.bankTransfer!.accountNumber!,
                                  "account",
                                )
                              }
                            >
                              {copiedField === "account" ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {payout.bankTransfer!.iban && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            IBAN:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs" dir="ltr">
                              {payout.bankTransfer!.iban}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                copyToClipboard(
                                  payout.bankTransfer!.iban!,
                                  "iban",
                                )
                              }
                            >
                              {copiedField === "iban" ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Proof Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5" />
              ارفع إيصال الدفع
            </CardTitle>
            <CardDescription>{data.proofInstructionAr}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="proof-upload"
              />
              <label htmlFor="proof-upload" className="cursor-pointer">
                {proofImage ? (
                  <div className="space-y-2">
                    <Check className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="text-sm font-medium">{proofImage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      اضغط لتغيير الصورة
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      اضغط لرفع صورة الإيصال أو السكرينشوت
                    </p>
                  </div>
                )}
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                رقم المرجع (اختياري)
              </label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="رقم العملية أو المرجع"
                dir="ltr"
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmitProof}
              disabled={(!proofImage && !referenceNumber) || submitting}
            >
              {submitting ? "جاري الإرسال..." : "📤 إرسال إيصال الدفع"}
            </Button>
          </CardContent>
        </Card>

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <strong>مهم:</strong> تأكد من تحويل المبلغ الصحيح ({data.amount}{" "}
            {data.currency}) قبل إرسال الإيصال.
          </div>
        </div>
      </div>
    </div>
  );
}
