"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import { isKnownLocale } from "@/lib/content/locales";

const LocalesInput = z.object({
  locales: z.array(z.string()).min(1, "Tiene que quedar al menos un idioma"),
  defaultLocale: z.string(),
});

export type LocalesState = { error?: string; ok?: string };

/**
 * Activa o desactiva idiomas del espacio.
 *
 * Desactivar uno NO borra su contenido: las filas siguen ahí y vuelven a ser
 * accesibles al reactivarlo. Lo que hace es dejar de servirlo por la API y
 * bloquear la creación de contenido nuevo en ese idioma — que es lo que
 * significa "ya no publicamos en gallego", no "tira el gallego a la basura".
 */
export async function saveLocales(
  tenantSlug: string,
  _prev: LocalesState,
  formData: FormData,
): Promise<LocalesState> {
  const parsed = LocalesInput.safeParse({
    locales: formData.getAll("locales").map(String),
    defaultLocale: String(formData.get("defaultLocale") ?? ""),
  });

  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }

  const { locales, defaultLocale } = parsed.data;

  if (!locales.every(isKnownLocale)) {
    return { error: "Hay algún idioma no reconocido." };
  }
  if (!locales.includes(defaultLocale)) {
    return { error: "El idioma principal tiene que estar entre los activos." };
  }

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "branding.manage")) {
    return { error: "No tienes permiso para cambiar los idiomas." };
  }

  const supabase = await createServerClient();

  // Se avisa de lo que quedaría fuera de la web en vez de dejar que el
  // cliente lo descubra cuando su sitio pierda páginas.
  const removed = tenant.locales.filter((l) => !locales.includes(l));
  if (removed.length) {
    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .in("locale", removed)
      .is("deleted_at", null);

    if ((count ?? 0) > 0) {
      return {
        error: `Hay ${count} contenido(s) en ${removed.join(", ")}. Se conservarán, pero dejarán de servirse por la API. Bórralos o tradúcelos antes si no es lo que quieres.`,
      };
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({ locales, default_locale: defaultLocale })
    .eq("id", tenant.id);

  if (error) return { error: "No se pudieron guardar los idiomas." };

  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: "Idiomas actualizados." };
}
