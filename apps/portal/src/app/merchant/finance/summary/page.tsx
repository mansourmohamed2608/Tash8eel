import { redirect } from "next/navigation";

export default function FinanceSummaryRedirect() {
  redirect("/merchant/reports/cfo");
}
