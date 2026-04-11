"use client";

import { motion } from "framer-motion";
import { IntelligenceBanner } from "@/components/dashboard/IntelligenceBanner";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { TopProductsChart } from "@/components/dashboard/TopProductsChart";
import { ChannelStatus } from "@/components/dashboard/ChannelStatus";
import { OrdersTable } from "@/components/dashboard/OrdersTable";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { kpiMetrics } from "@/lib/constants/mockData";

export default function DashboardPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6"
    >
      <IntelligenceBanner />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiMetrics.map((metric) => (
          <KPICard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <RevenueChart />
        </div>
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <TopProductsChart />
          <ChannelStatus />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4 pb-20 md:pb-0">
        <div className="col-span-12 xl:col-span-7">
          <OrdersTable />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <ActivityFeed />
        </div>
      </section>
    </motion.div>
  );
}
