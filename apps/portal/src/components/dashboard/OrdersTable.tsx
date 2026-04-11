import {
  DashboardCard,
  DashboardCardContent,
  DashboardCardHeader,
} from "@/components/dashboard/Card";
import { DashboardDataTable } from "@/components/dashboard/DataTable";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { latestOrders } from "@/lib/constants/mockData";
import { MessageCircle, Phone, Send, Instagram } from "lucide-react";
import Link from "next/link";

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} ج.م`;
}

const channelIconMap = {
  whatsapp: { icon: MessageCircle, color: "#22C55E" },
  messenger: { icon: Send, color: "#3B82F6" },
  instagram: { icon: Instagram, color: "#EC4899" },
  phone: { icon: Phone, color: "#A1A1AA" },
};

const statusVariantMap = {
  جديد: "info",
  "قيد التجهيز": "warning",
  "تم التوصيل": "success",
  ملغي: "danger",
} as const;

export function OrdersTable() {
  return (
    <DashboardCard>
      <DashboardCardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
          آخر الطلبات
        </h2>
        <Link
          href="/merchant/orders"
          className="text-[12px] text-[var(--accent-gold)] transition duration-150 ease-in hover:underline"
        >
          عرض الكل
        </Link>
      </DashboardCardHeader>
      <DashboardCardContent className="p-0">
        <DashboardDataTable
          data={latestOrders}
          rowKey={(order) => order.id}
          columns={[
            {
              key: "id",
              header: "رقم الطلب",
              render: (order) => (
                <span className="tash-latin text-[12px] text-[var(--accent-gold)]">
                  {order.id}
                </span>
              ),
            },
            {
              key: "customer",
              header: "العميل",
              render: (order) => (
                <div className="space-y-1">
                  <p className="font-[var(--font-body)] text-[13px] text-[var(--text-primary)]">
                    {order.customer}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {order.source}
                  </p>
                </div>
              ),
            },
            {
              key: "channel",
              header: "القناة",
              mobileHidden: true,
              render: (order) => {
                const { icon: Icon, color } = channelIconMap[order.channel];
                return <Icon className="h-4 w-4" style={{ color }} />;
              },
            },
            {
              key: "total",
              header: "الإجمالي",
              render: (order) => (
                <span className="tash-latin text-[13px] text-[var(--text-primary)]">
                  {formatMoney(order.total)}
                </span>
              ),
            },
            {
              key: "status",
              header: "الحالة",
              render: (order) => (
                <StatusPill variant={statusVariantMap[order.status]}>
                  {order.status}
                </StatusPill>
              ),
            },
            {
              key: "time",
              header: "الوقت",
              mobileHidden: true,
              render: (order) => (
                <span className="tash-latin text-[11px] text-[var(--text-muted)]">
                  {order.time}
                </span>
              ),
            },
          ]}
        />
      </DashboardCardContent>
    </DashboardCard>
  );
}
