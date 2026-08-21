import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readFallback, readLocale } from "@/lib/api/response";
import { serializeCategory } from "@/lib/api/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/categories
 *   ?kind=CASE_STUDY
 *
 * Con el conteo de entradas publicadas: es lo que permite a la web del
 * cliente montar un menú sin enlazar a categorías vacías.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  // Se estrecha al enum antes de tocar la consulta: así el tipo generado
  // valida el filtro y un `kind` inventado da 400 en vez de un 500 opaco.
  const VALID_KINDS = ["BLOG", "CASE_STUDY", "SERVICE", "CUSTOM"] as const;
  type Kind = (typeof VALID_KINDS)[number];

  const rawKind = new URL(req.url).searchParams.get("kind");
  if (rawKind && !(VALID_KINDS as readonly string[]).includes(rawKind)) {
    return apiError("bad_request", `"kind" debe ser uno de: ${VALID_KINDS.join(", ")}.`);
  }
  const kind = rawKind as Kind | null;

  /*
   * Las categorías ya no tienen idioma, pero `?locale=` se sigue admitiendo:
   * acota el CONTEO de entradas. "Cuántos artículos publicados en inglés hay
   * en esta categoría" sigue siendo una pregunta con sentido, y devolver el
   * total mezclando idiomas descuadraría cualquier portada.
   */
  const url = new URL(req.url);

  const locale = readLocale(url, ctx);
  if ("error" in locale) return apiError("bad_request", locale.error);

  /*
   * El conteo cuenta lo mismo que devuelve el listado.
   *
   * Con respaldo, `/posts?locale=en` sirve el español de lo que no está
   * traducido; si aquí se contara sólo el inglés, el menú diría "0" junto a
   * una categoría que al abrirla tiene entradas. Se cuentan CONTENIDOS, no
   * filas: el grupo que existe en los dos idiomas vale uno.
   */
  const localeSet =
    readFallback(url) && locale.locale !== ctx.defaultLocale
      ? [locale.locale, ctx.defaultLocale]
      : [locale.locale];

  const db = createServiceClient();

  let query = db
    .from("categories")
    .select("id, slug, name, kind, description, position, parent_id")
    .eq("tenant_id", ctx.tenantId)
    .order("position");

  if (kind) query = query.eq("kind", kind);

  const [{ data: categories, error }, { data: posts, error: postsError }] = await Promise.all([
    query,
    // Los conteos se traen en una sola consulta y se agregan en memoria:
    // una subconsulta por categoría sería N+1 contra la base.
    db
      .from("posts")
      .select("category_id, translation_group_id")
      .eq("tenant_id", ctx.tenantId)
      .in("locale", localeSet)
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .lte("published_at", new Date().toISOString()),
  ]);

  if (error || postsError) {
    console.error("GET /api/v1/categories", error ?? postsError);
    return apiError("server_error", "No se pudieron recuperar las categorías.");
  }

  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const p of posts ?? []) {
    if (!p.category_id) continue;
    if (seen.has(p.translation_group_id)) continue;
    seen.add(p.translation_group_id);
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }

  return apiJson(
    {
      data: (categories ?? []).map((c) => ({
        ...serializeCategory(c),
        parentId: c.parent_id,
        postCount: counts.get(c.id) ?? 0,
      })),
    },
    guard.headers,
  );
}
