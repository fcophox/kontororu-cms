import { createServerClient } from "@/lib/supabase/server";

/**
 * Decide a dónde aterriza un usuario recién autenticado.
 *
 * Vive aquí y no en cada pantalla porque el destino se calcula en tres
 * sitios distintos —login, `/` y el callback del magic link— y tenerlo
 * duplicado significaba que arreglar uno dejaba los otros dos fuera.
 *
 * El SuperAdmin va a /admin: su trabajo es la plataforma, no el contenido
 * de un cliente concreto. Sigue pudiendo entrar a cualquier espacio desde
 * el listado de clientes.
 */
export async function resolveLandingPath(userId: string): Promise<string> {
  const supabase = await createServerClient();

  const { data: profile } = await supabase
    .from("users_profiles")
    .select("is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_superadmin) return "/admin";

  // El `.eq("user_id")` importa: RLS deja ver también las membresías de tus
  // compañeros en tus tenants, así que sin el filtro la "primera" fila
  // podía ser la de otra persona.
  const { data: memberships } = await supabase
    .from("tenant_users")
    .select("tenant:tenants(slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const first = memberships?.[0]?.tenant as unknown as { slug: string } | undefined;
  return first ? `/${first.slug}` : "/switch";
}
