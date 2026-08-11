import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readLocale } from "@/lib/api/response";
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

  const locale = readLocale(new URL(req.url), ctx);
  if ("error" in locale) return apiError("bad_request", locale.error);

  const db = createServiceClient();

  const first = await fetchPublishedPost(db, ctx.tenantId, locale.locale, { slug });

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
      const retry = await fetchPublishedPost(db, ctx.tenantId, locale.locale, {
        groupId: sibling.translation_group_id,
      });
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
  locale: string,
  by: { slug: string } | { groupId: string },
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
    // El mismo slug puede existir en varios idiomas: sin este filtro,
    // `maybeSingle()` fallaría en cuanto hubiera una traducción homónima.
    .eq("locale", locale)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());

  query = "slug" in by
    ? query.eq("slug", by.slug)
    : query.eq("translation_group_id", by.groupId);

  const { data, error } = await query.maybeSingle();
  return error ? { error } : { data };
}
