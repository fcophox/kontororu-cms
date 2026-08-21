import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readFallback, readLocale } from "@/lib/api/response";
import { attachTranslations, fetchTranslations } from "@/lib/api/translations";
import { collectMedia, serializePost, signMediaBatch } from "@/lib/api/serializers";
import { refreshContentMedia } from "@/lib/api/content-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/posts/[slug]
 *
 * Detalle con el cuerpo del contenido. Es lo que necesita una página de
 * artículo: `content.html` para inyectar directamente, `content.json` para
 * quien prefiera recorrer el documento y renderizar sus propios componentes.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { slug } = await params;

  const url = new URL(req.url);

  const locale = readLocale(url, ctx);
  if ("error" in locale) return apiError("bad_request", locale.error);

  const db = createServiceClient();

  /*
   * Orden de preferencia: el idioma pedido y, si el contenido no está
   * traducido, el principal del espacio. Sin respaldo la lista tiene un solo
   * idioma y una traducción que falta vuelve a ser un 404.
   */
  const fallback = readFallback(url);
  const prefer =
    fallback && locale.locale !== ctx.defaultLocale
      ? [locale.locale, ctx.defaultLocale]
      : [locale.locale];

  const first = await fetchPublishedPost(db, ctx.tenantId, prefer, { slug });

  if ("error" in first) {
    console.error("GET /api/v1/posts/[slug]", first.error);
    return apiError("server_error", "No se pudo recuperar el contenido.");
  }

  /*
   * Segundo intento: el slug puede venir en otro idioma.
   *
   * El visitante está en /blog/mi-articulo y pulsa "EN". Su navegador sólo
   * conoce el slug español, y el inglés es otro. Sin esto, cambiar de idioma
   * en la web devolvía 404 salvo que el front hubiera guardado antes el mapa
   * de traducciones.
   *
   * Se paga sólo cuando la primera consulta no encuentra nada. La respuesta
   * lleva el slug real del contenido, así que el front puede redirigir a su
   * URL canónica.
   */
  let data = first.data;
  if (!data) {
    const { data: sibling } = await db
      .from("posts")
      .select("translation_group_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("slug", slug)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (sibling) {
      const retry = await fetchPublishedPost(
        db,
        ctx.tenantId,
        prefer,
        { groupId: sibling.translation_group_id },
        // Resuelto ya el grupo, el respaldo se estira a CUALQUIER idioma
        // publicado: un contenido que sólo existe en francés se sirve en
        // francés antes que devolver un 404 por algo que sí está publicado.
        { anyLocale: fallback },
      );
      if ("error" in retry) {
        console.error("GET /api/v1/posts/[slug]", retry.error);
        return apiError("server_error", "No se pudo recuperar el contenido.");
      }
      data = retry.data;
    }
  }

  // Un borrador y un slug inexistente devuelven lo mismo: que exista un
  // borrador con ese nombre no es información pública.
  if (!data) {
    return apiError(
      "not_found",
      `No hay contenido publicado en "${slug}" (idioma ${locale.locale}).`,
    );
  }

  const row = data as unknown as Record<string, unknown>;

  // Las imágenes del cuerpo se vuelven a firmar aquí: el `src` guardado en el
  // documento caduca, así que servirlo tal cual degradaría el contenido con
  // el tiempo sin que nadie se entere.
  const [urls, content, byGroup] = await Promise.all([
    signMediaBatch(db, collectMedia([row])),
    refreshContentMedia(db, ctx.tenantId, {
      html: String(row.content_html ?? ""),
      json: row.content_json ?? { type: "doc", content: [] },
    }),
    fetchTranslations(db, ctx.tenantId, [String(row.translation_group_id)]),
  ]);
  attachTranslations([row], byGroup);

  row.content_html = content.html;
  row.content_json = content.json;

  return apiJson({ data: serializePost(row, urls, { withContent: true }) }, guard.headers);
}

/**
 * Trae UNA entrada publicada de un idioma, buscada por slug o por grupo.
 *
 * Las dos búsquedas comparten el mismo `select` y las mismas condiciones de
 * visibilidad. Tenerlas en una sola función evita que la vía de respaldo
 * —resolver por grupo— se relaje con el tiempo y acabe sirviendo un borrador.
 */
async function fetchPublishedPost(
  db: ReturnType<typeof createServiceClient>,
  tenantId: string,
  /** Idiomas por orden de preferencia: el pedido primero. */
  prefer: string[],
  by: { slug: string } | { groupId: string },
  opts: { anyLocale?: boolean } = {},
): Promise<{ data: unknown } | { error: unknown }> {
  let query = db
    .from("posts")
    .select(
      `id, slug, locale, translation_group_id, title, excerpt, content_html, content_json, custom_fields,
       published_at, updated_at, seo, reading_time,
       category:categories(id, slug, name, kind),
       cover:media!posts_cover_media_id_fkey(id, bucket, path, provider, alt_text, width, height),
       tags:post_tags(tag:tags(id, slug, name))`,
    )
    // El tenant sale de la clave, nunca de la ruta: dos clientes pueden tener
    // el mismo slug y cada uno debe recibir el suyo.
    .eq("tenant_id", tenantId)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());

  // El mismo slug puede existir en varios idiomas, así que la consulta puede
  // traer varias filas: se ordenan por preferencia aquí abajo en vez de
  // dejárselo a un `maybeSingle()` que fallaría con una traducción homónima.
  if (!opts.anyLocale) query = query.in("locale", prefer);

  query = "slug" in by
    ? query.eq("slug", by.slug)
    : query.eq("translation_group_id", by.groupId);

  const { data, error } = await query.limit(prefer.length + MAX_FALLBACK_LOCALES);
  if (error) return { error };

  const rows = (data ?? []) as { locale: string }[];
  const match = prefer.map((l) => rows.find((r) => r.locale === l)).find(Boolean);

  return { data: match ?? rows[0] ?? null };
}

/**
 * Cuántas filas de más se traen al buscar por grupo sin filtrar idioma.
 *
 * Un grupo tiene una fila por idioma activo del espacio, que son pocos. El
 * tope existe para que la consulta de respaldo no crezca sin límite si algún
 * día alguien activa veinte.
 */
const MAX_FALLBACK_LOCALES = 10;
