import { redirect } from "next/navigation";

export default async function CapacityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ vista: "configuracion" });
  for (const [key, value] of Object.entries(params)) {
    if (key === "vista") continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  redirect(`/produccion?${query.toString()}`);
}
