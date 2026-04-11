import { MessageCircle, Phone, Send, Instagram } from "lucide-react";
import {
  DashboardCard,
  DashboardCardContent,
  DashboardCardHeader,
} from "@/components/dashboard/Card";
import { channelStatuses } from "@/lib/constants/mockData";

const channelIconMap = {
  whatsapp: { icon: MessageCircle, color: "#22C55E" },
  messenger: { icon: Send, color: "#3B82F6" },
  instagram: { icon: Instagram, color: "#EC4899" },
  phone: { icon: Phone, color: "#A1A1AA" },
};

export function ChannelStatus() {
  return (
    <DashboardCard>
      <DashboardCardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
            القنوات النشطة
          </h2>
          <span className="tash-live-dot" />
        </div>
      </DashboardCardHeader>
      <DashboardCardContent className="p-0">
        {channelStatuses.map((channel) => {
          const { icon: Icon, color } = channelIconMap[channel.icon];

          return (
            <div
              key={channel.id}
              className="flex h-10 items-center gap-3 border-b border-[var(--border-subtle)] px-5 last:border-b-0"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]"
                style={{ color }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13px] text-[var(--text-primary)]">
                {channel.name}
              </span>
              <span className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-success)]" />
                {channel.status}
              </span>
              <span className="tash-latin text-[11px] text-[var(--text-muted)]">
                {channel.lastMessageTime}
              </span>
            </div>
          );
        })}
      </DashboardCardContent>
    </DashboardCard>
  );
}
