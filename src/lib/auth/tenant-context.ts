import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { parseBranding, type TenantBranding } from "@/lib/theme/branding";
import { asLimits, type TenantLimits } from "@/lib/content/json";

import type { TenantRole } from "./roles";

export type { TenantRole };

export type TenantContext = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
    plan: "FREE" | "PRO" | "ENTERPRISE";
    branding: TenantBranding;
    limits: TenantLimits;
    storageBucket: string;
    locales: string[];
    defaultLocale: string;
  };
  role: TenantRole;
  user: { id: string; email: string; fullName: string | null; isSuperadmin: boolean };
};

/**
 * `cache()` deduplica por request: el layout, la sidebar, el page y cada
 * Server Component que lo necesite comparten una sola consulta. Sin esto,
 * una pantalla del dashboard dispara diez veces la misma query.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users_profiles")
    .select("id, email, full_name, is_superadmin")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    isSuperadmin: profile.is_superadmin,
  };
});

/**
 * Resuelve el tenant del segmento `[tenantSlug]` y el rol del usuario en él.
 *
 * La comprobación de pertenencia la hace RLS, no este código: si el usuario
 * no es miembro, la consulta devuelve cero filas. Eso significa que un
 * `notFound()` aquí es indistinguible de un tenant inexistente — deliberado.
 * Un 403 confirmaría al atacante que el slug existe y quién es cliente de
 * Rukma Studio; un 404 no filtra nada.
 */
export const getTenantContext = cache(
  async (slug: string): Promise<TenantContext> => {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const supabase = await createServerClient();

    const { data } = await supabase
      .from("tenant_users")
      .select(
        `role,
         tenant:tenants!inner(id, slug, name, status, plan, branding, limits, storage_bucket, locales, default_locale)`,
      )
      .eq("tenants.slug", slug)
      .eq("user_id", user.id)
      .maybeSingle();

    // El SuperAdmin entra a cualquier tenant para dar soporte, sin membresía.
    if (!data) {
      if (!user.isSuperadmin) notFound();

      const { data: tenant } = await supabase
        .from("tenants")
        .select("id, slug, name, status, plan, branding, limits, storage_bucket, locales, default_locale")
        .eq("slug", slug)
        .maybeSingle();

      if (!tenant) notFound();

      return {
        tenant: {
          ...tenant,
          branding: parseBranding(tenant.branding),
          limits: asLimits(tenant.limits),
          storageBucket: tenant.storage_bucket,
          locales: tenant.locales,
          defaultLocale: tenant.default_locale,
        },
        role: "OWNER",
        user,
      };
    }

    const tenant = data.tenant as unknown as TenantContext["tenant"] & {
      branding: unknown;
      storage_bucket: string;
      locales: string[];
      default_locale: string;
    };

    // La suspensión NO se resuelve aquí con un redirect.
    //
    // Esta función la llama el layout de [tenantSlug]; redirigir a una ruta
    // que cuelga de ese mismo layout crea un bucle infinito: el layout
    // resuelve el tenant → redirige → el layout vuelve a resolverlo. Una
    // función de datos no debe navegar. El layout lee `status` y decide qué
    // renderizar, que además evita el salto de URL.
    return {
      tenant: {
        ...tenant,
        branding: parseBranding(tenant.branding),
        limits: asLimits(tenant.limits),
        storageBucket: tenant.storage_bucket,
        locales: tenant.locales,
        defaultLocale: tenant.default_locale,
      },
      role: data.role as TenantRole,
      user,
    };
  },
);

/** Tenants a los que pertenece el usuario — para el switcher de la sidebar. */
export const getUserTenants = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createServerClient();
  // El `.eq("user_id")` es imprescindible: RLS deja ver TODAS las membresías
  // de los tenants a los que perteneces, incluidas las de tus compañeros.
  // Sin el filtro, invitar a alguien duplicaba tu propio espacio en la lista.
  const { data } = await supabase
    .from("tenant_users")
    .select("role, tenant:tenants(id, slug, name, branding, status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    role: row.role as TenantRole,
    ...(row.tenant as unknown as {
      id: string;
      slug: string;
      name: string;
      branding: unknown;
      status: string;
    }),
  }));
});
