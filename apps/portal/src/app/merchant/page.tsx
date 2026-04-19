import { redirect } from "next/navigation";

export default function MerchantRootRedirect() {
  redirect("/merchant/dashboard");
}
