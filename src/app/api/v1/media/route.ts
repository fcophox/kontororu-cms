import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { listMedia } from "@/lib/api/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media
 *   ?type=image&limit=20&cursor=<createdAt>
 *
 * La biblioteca de archivos del espacio. Requiere el permiso `media:read`,
 * separado de `content:read`: una clave que sólo alimenta un blog no tiene por
 * qué poder enumerar todos los archivos subidos.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "media:read");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);

  const result = await listMedia(createServiceClient(), guard.ctx, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    type: url.searchParams.get("type"),
  });

  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data.items, pagination: result.data.pagination }, guard.headers);
}
