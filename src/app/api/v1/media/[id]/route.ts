import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { signMediaBatch, SIGNED_URL_TTL } from "@/lib/api/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/media/[id]
 *
 * Un archivo concreto con URL firmada fresca. Sirve para renovar la URL de
 * una imagen que el cliente cacheó: las firmas caducan, los ids no.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApiRequest(req, "media:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;

  // Sin esto, un id malformado llega a Postgres y vuelve como error de
  // sintaxis: un 500 donde corresponde un 400.
  if (!UUID.test(id)) return apiError("bad_request", "El identificador no es válido.");

  const db = createServiceClient();

  const { data, error } = await db
    .from("media")
    .select("id, bucket, path, provider, mime_type, size_bytes, width, height, alt_text, created_at")
    // El tenant sale de la clave: pedir el id de otro cliente da 404, no su archivo.
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("GET /api/v1/media/[id]", error);
    return apiError("server_error", "No se pudo recuperar el archivo.");
  }
  if (!data) return apiError("not_found", "No existe ese archivo.");

  const urls = await signMediaBatch(db, [data]);
  const url = urls.get(data.path);

  // La fila existe pero el objeto no está en Storage: un 404 sería engañoso
  // —el archivo consta en la biblioteca— y un 200 con `url: null` obligaría
  // al cliente a comprobarlo siempre.
  if (!url) {
    return apiError("server_error", "El archivo ya no está disponible en el almacenamiento.");
  }

  return apiJson(
    {
      data: {
        id: data.id,
        url,
        alt: data.alt_text,
        mimeType: data.mime_type,
        sizeBytes: data.size_bytes,
        width: data.width,
        height: data.height,
        createdAt: data.created_at,
        expiresIn: SIGNED_URL_TTL,
      },
    },
    guard.headers,
  );
}
