import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/tenant-context";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Raíz: reparte según el estado de la sesión.
 * La landing de marketing de Rukma Studio vive en (marketing) y se montará
 * aquí cuando exista; de momento esto sólo evita un 404 en `/`.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("tenant_users")
    .select("tenant:tenants(slug)")
    .limit(1);

  const first = data?.[0]?.tenant as unknown as { slug: string } | undefined;
  redirect(first ? `/${first.slug}` : "/switch");
}
