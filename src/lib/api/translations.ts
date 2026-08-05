import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Traducciones hermanas de un conjunto de contenidos.
 *
 * Se resuelve con UNA consulta para toda la página, no con un embed: no hay
 * clave foránea entre `posts` y sí mismo por `translation_group_id`, así que
 * PostgREST no puede anidarlo. Un `select` extra por post sería N+1.
 *
 * Sólo se devuelven traducciones PUBLICADAS y no borradas: enlazar desde la
 * web del cliente a una traducción en borrador daría un 404 a sus visitantes
 * y, peor, a los buscadores.
 */
export async function fetchTranslations(
  db: SupabaseClient,
  tenantId: string,
  groupIds: string[],
  excludeIds: string[] = [],
): Promise<Map<string, { locale: string; slug: string }[]>> {
  const byGroup = new Map<string, { locale: string; slug: string }[]>();
  if (groupIds.length === 0) return byGroup;

  const { data } = await db
    .from("posts")
    .select("translation_group_id, locale, slug")
    .eq("tenant_id", tenantId)
    .in("translation_group_id", [...new Set(groupIds)])
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());

  for (const row of data ?? []) {
    // El propio contenido no es una "traducción" de sí mismo.
    if (excludeIds.length && excludeIds.includes(row.slug)) continue;

    const list = byGroup.get(row.translation_group_id) ?? [];
    list.push({ locale: row.locale, slug: row.slug });
    byGroup.set(row.translation_group_id, list);
  }

  return byGroup;
}

/** Adjunta a cada fila su lista de traducciones, lista para serializar. */
export function attachTranslations(
  rows: Record<string, unknown>[],
  byGroup: Map<string, { locale: string; slug: string }[]>,
): void {
  for (const row of rows) {
    const group = String(row.translation_group_id ?? "");
    const siblings = byGroup.get(group) ?? [];
    row.translations = siblings.filter((t) => t.locale !== row.locale);
  }
}
