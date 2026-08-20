import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, volatileCacheHeaders } from "@/lib/api/response";
import { signMediaBatch } from "@/lib/api/serializers";
import { parsePortfolioSettings } from "@/lib/addons/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/addons/portfolio
 *
 * Los trabajos del portfolio del cliente, para pintarlos como tarjetas en su
 * web. Devuelve también la galería elegida, para que la web sepa con qué
 * plantilla montarlas sin preguntar.
 *
 * Requiere el scope `content:read`: es material que el cliente publica, del
 * mismo nivel que sus entradas.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const db = createServiceClient();

  const { data, error } = await db
    .from("tenant_addons")
    .select("settings, is_enabled")
    .eq("tenant_id", ctx.tenantId)
    .eq("addon_key", "portfolio")
    .maybeSingle();

  if (error) {
    console.error("GET /api/v1/addons/portfolio", error);
    return apiError("server_error", "No se pudo recuperar el portfolio.");
  }

  if (!data?.is_enabled) {
    return apiError("not_found", "El complemento Portfolio no está activo.");
  }

  const settings = parsePortfolioSettings(data.settings);

  /*
   * Despublicado responde 404, no una lista vacía.
   *
   * Una lista vacía es "aún no hay trabajos" y la web pintaría su sección
   * vacía; 404 es "esta sección no existe ahora mismo", que es lo que el
   * interruptor quiere decir. Es el mismo 404 que da el complemento apagado:
   * la API no distingue entre no contratado, apagado y despublicado, porque
   * ninguna de las tres es asunto de quien consume.
   */
  if (!settings.isPublished) {
    return apiError("not_found", "El portfolio no está publicado.");
  }

  /*
   * Las imágenes se vuelven a firmar por su id de mediateca.
   *
   * La URL guardada en `settings` se firmó al subir el archivo y hace tiempo
   * que caducó: servirla tal cual daría tarjetas con la foto rota, y encima
   * de forma intermitente según cuándo se creó cada elemento.
   */
  const mediaIds = [...new Set(settings.items.map((i) => i.imageMediaId).filter(Boolean))];

  const { data: mediaRows } = mediaIds.length
    ? await db
        .from("media")
        .select("id, bucket, path, provider, mime_type, alt_text, width, height")
        .eq("tenant_id", ctx.tenantId)
        .in("id", mediaIds)
    : { data: [] };

  const urls = await signMediaBatch(db, mediaRows ?? []);
  const byId = new Map((mediaRows ?? []).map((row) => [row.id, row]));

  return apiJson(
    {
      data: {
        gallery: settings.gallery,
        items: settings.items.map((item) => {
          const media = byId.get(item.imageMediaId);
          const url = media ? urls.get(media.path) : undefined;

          return {
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category || null,
            externalUrl: item.externalUrl || null,
            // `null` y no la URL caducada: una tarjeta sin foto se puede
            // maquetar, una con la foto rota no.
            image: media && url
              ? { id: media.id, url, alt: media.alt_text, width: media.width, height: media.height }
              : null,
            createdAt: item.createdAt,
          };
        }),
      },
    },
    // `addon.updated` avisa a quien se haya suscrito. La ventana corta es
    // para quien no: se pone al día solo, sin servir nada obsoleto.
    { ...guard.headers, ...volatileCacheHeaders() },
  );
}
