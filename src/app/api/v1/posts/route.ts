import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readFallback, readLimit, readLocale } from "@/lib/api/response";
import { attachTranslations, fetchTranslations } from "@/lib/api/translations";
import { collectMedia, serializePost, signMediaBatch } from "@/lib/api/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/posts
 *   ?category=blog&tag=nextjs&q=fintech&limit=20&cursor=<publishedAt>
 *
 * Listado de contenido publicado del tenant dueño de la API Key. No incluye
 * el cuerpo: para eso está /api/v1/posts/[slug]. Devolver el HTML de cada
 * entrada en un listado de 100 multiplica el peso de la respuesta sin que
 * nadie lo use para pintar una portada.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const url = new URL(req.url);

  const locale = readLocale(url, ctx);
  if ("error" in locale) return apiError("bad_request", locale.error);

  const fallback = readFallback(url);
  /*
   * Con respaldo se piden los dos idiomas y se colapsa después por grupo.
   *
   * No hay forma de decirle a PostgREST "el inglés de este contenido y, si no
   * lo hay, el español": eso es un DISTINCT ON por grupo, y la API REST no lo
   * expone. Traer las dos filas y quedarse con una en memoria cuesta como
   * mucho el doble de filas en una página; una consulta por grupo sería N+1.
   */
  const localeSet =
    fallback && locale.locale !== ctx.defaultLocale
      ? [locale.locale, ctx.defaultLocale]
      : [locale.locale];

  const limit = readLimit(url);
  const cursor = url.searchParams.get("cursor");
  const category = url.searchParams.get("category");
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q");

  const db = createServiceClient();

  /*
   * `!inner` NO es opcional en los embeds que se filtran.
   *
   * Sin él, PostgREST aplica el filtro al recurso ANIDADO en vez de al padre:
   * `?category=inexistente` devolvía todos los posts con `category: null` en
   * lugar de ninguno. El filtro parecía funcionar y no filtraba nada.
   *
   * El embed se pide `!inner` sólo cuando hay filtro; si fuese siempre,
   * desaparecerían los posts sin categoría.
   */
  const categoryEmbed = category
    ? "category:categories!inner(id, slug, name, kind)"
    : "category:categories(id, slug, name, kind)";
  const tagEmbed = tag
    ? "tags:post_tags!inner(tag:tags!inner(id, slug, name))"
    : "tags:post_tags(tag:tags(id, slug, name))";

  let query = db
    .from("posts")
    .select(
      `id, slug, locale, translation_group_id, title, excerpt, custom_fields, published_at, updated_at, seo, reading_time,
       ${categoryEmbed},
       cover:media!posts_cover_media_id_fkey(id, bucket, path, provider, alt_text, width, height),
       ${tagEmbed}`,
    )
    // Filtro de tenant explícito: el service role no aplica RLS.
    .eq("tenant_id", ctx.tenantId)
    .in("locale", localeSet)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    // Cada grupo aporta como mucho una fila por idioma pedido, así que pedir el
    // doble garantiza que tras colapsar sigue habiendo `limit + 1` contenidos
    // distintos con los que decidir si hay página siguiente.
    .limit((limit + 1) * localeSet.length);

  if (cursor) query = query.lt("published_at", cursor);
  if (category) query = query.eq("categories.slug", category);
  if (tag) query = query.eq("post_tags.tags.slug", tag);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/v1/posts", error);
    return apiError("server_error", "No se pudo recuperar el contenido.");
  }

  const collapsed = collapseByGroup(
    data as unknown as Record<string, unknown>[],
    locale.locale,
  );

  const hasMore = collapsed.length > limit;
  const rows = hasMore ? collapsed.slice(0, limit) : collapsed;

  const [urls, byGroup] = await Promise.all([
    signMediaBatch(db, collectMedia(rows)),
    fetchTranslations(db, ctx.tenantId, rows.map((r) => String(r.translation_group_id))),
  ]);
  attachTranslations(rows, byGroup);

  return apiJson(
    {
      data: rows.map((row) => serializePost(row, urls)),
      pagination: {
        hasMore,
        nextCursor: hasMore ? ((rows.at(-1)?.published_at as string) ?? null) : null,
      },
    },
    guard.headers,
  );
}

/**
 * Deja UNA fila por contenido: la del idioma pedido si existe, si no la otra.
 *
 * El orden de las claves de un Map es el de su primera inserción, así que
 * sustituir el español por el inglés no mueve el contenido de sitio en el
 * feed: sigue donde lo puso su `published_at`.
 */
function collapseByGroup(
  rows: Record<string, unknown>[],
  preferred: string,
): Record<string, unknown>[] {
  const byGroup = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const group = String(row.translation_group_id);
    const current = byGroup.get(group);
    if (!current || (current.locale !== preferred && row.locale === preferred)) {
      byGroup.set(group, row);
    }
  }

  return [...byGroup.values()];
}
