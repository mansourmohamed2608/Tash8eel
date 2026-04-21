import { redirect } from "next/navigation";

export default async function RetiredPlanRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry != null) query.append(key, String(entry));
      }
      continue;
    }

    if (value != null) query.set(key, String(value));
  }

  const destination = `/merchant/billing${query.toString() ? `?${query.toString()}` : ""}`;
  redirect(destination);
}
