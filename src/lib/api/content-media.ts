import type { SupabaseClient } from "@supabase/supabase-js";
import { signMediaBatch, SIGNED_URL_TTL } from "./serializers";

/**
 * Refirmado de las imágenes incrustadas en el contenido.
 *
 * El `src` que el editor guarda es una URL firmada, y las URLs firmadas
 * caducan. Sin esto, el contenido publicado se degrada solo: pasado el plazo,
 * todas las imágenes de todos los artículos dejan de cargar en la web del
 * cliente y nada en el CMS lo delata.
 *
 * La pieza que lo arregla es `data-media-id`: el src es desechable, el id no.
 * Se buscan los ids del documento, se firman de nuevo y se sustituyen los src
 * al servir. Coste: una consulta extra, y sólo en el detalle —el listado no
 * lleva cuerpo—.
 */

const MEDIA_ID_IN_HTML = /data-media-id="([0-9a-f-]{36})"/gi;

type ImageAttrs = { src?: string; mediaId?: string | null };

function collectFromJson(node: unknown, ids: Set<string>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const child of node) collectFromJson(child, ids);
    return;
  }

  const n = node as { type?: string; attrs?: ImageAttrs; content?: unknown };
  if (n.type === "image" && n.attrs?.mediaId) ids.add(n.attrs.mediaId);
  if (n.content) collectFromJson(n.content, ids);
}

function rewriteJson(node: unknown, urls: Map<string, string>): unknown {
  if (!node || typeof node !== "object") return node;

  if (Array.isArray(node)) return node.map((child) => rewriteJson(child, urls));

  const n = node as { type?: string; attrs?: ImageAttrs; content?: unknown };
  const next: Record<string, unknown> = { ...(node as Record<string, unknown>) };

  if (n.type === "image" && n.attrs?.mediaId) {
    const fresh = urls.get(n.attrs.mediaId);
    if (fresh) next.attrs = { ...n.attrs, src: fresh };
  }
  if (n.content) next.content = rewriteJson(n.content, urls);

  return next;
}

/**
 * Devuelve el contenido con las URLs de imagen recién firmadas.
 *
 * Las imágenes SIN `data-media-id` se dejan intactas: son de contenido
 * anterior a este mecanismo, o insertadas a mano apuntando fuera. Rehacerlas
 * es imposible —no hay id que resolver— y tocarlas sería peor.
 */
export async function refreshContentMedia(
  db: SupabaseClient,
  tenantId: string,
  content: { html: string; json: unknown },
): Promise<{ html: string; json: unknown }> {
  const ids = new Set<string>();
  collectFromJson(content.json, ids);
  for (const match of content.html.matchAll(MEDIA_ID_IN_HTML)) ids.add(match[1]!.toLowerCase());

  if (ids.size === 0) return content;

  // El filtro por tenant no es decorativo: un `data-media-id` es texto que
  // alguien pudo escribir a mano en el documento, y sin esto serviría de
  // sonda para firmar archivos de otro cliente.
  const { data: media } = await db
    .from("media")
    .select("id, bucket, path, provider, alt_text, width, height")
    .eq("tenant_id", tenantId)
    .in("id", [...ids]);

  if (!media?.length) return content;

  const signed = await signMediaBatch(db, media);

  const byId = new Map<string, string>();
  for (const row of media) {
    const url = signed.get(row.path);
    if (url) byId.set(row.id, url);
  }

  return {
    json: rewriteJson(content.json, byId),
    html: rewriteHtml(content.html, byId),
  };
}

/**
 * Sustituye el `src` de cada `<img>` que lleve `data-media-id`.
 *
 * Se opera sobre la etiqueta completa y no sobre el documento entero para no
 * tocar otros `src` de la página (vídeos, iframes) ni texto que contenga algo
 * parecido a una URL.
 */
function rewriteHtml(html: string, urls: Map<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const idMatch = /data-media-id="([0-9a-f-]{36})"/i.exec(tag);
    const fresh = idMatch && urls.get(idMatch[1]!.toLowerCase());
    if (!fresh) return tag;

    return tag.includes('src="')
      ? tag.replace(/src="[^"]*"/i, `src="${fresh}"`)
      : tag.replace(/<img\b/i, `<img src="${fresh}"`);
  });
}

export { SIGNED_URL_TTL };
