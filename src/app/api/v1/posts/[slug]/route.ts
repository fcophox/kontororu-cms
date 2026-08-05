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

  const { data, error } = await db
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
    .eq("tenant_id", ctx.tenantId)
    // El mismo slug puede existir en varios idiomas: sin este filtro,
    // `maybeSingle()` fallaría en cuanto hubiera una traducción homónima.
    .eq("locale", locale.locale)
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("GET /api/v1/posts/[slug]", error);
    return apiError("server_error", "No se pudo recuperar el contenido.");
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
