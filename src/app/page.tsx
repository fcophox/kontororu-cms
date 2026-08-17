import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/tenant-context";
import { resolveLandingPath } from "@/lib/auth/landing";

/**
 * Raíz: reparte según el estado de la sesión.
 * La landing de marketing de Rukma Studio vive en (marketing) y se montará
 * aquí cuando exista; de momento esto sólo evita un 404 en `/`.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  redirect(await resolveLandingPath(user.id));
}
