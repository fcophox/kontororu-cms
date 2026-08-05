import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { getMedia } from "@/lib/api/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media/[id]
 *
 * Un archivo concreto con URL firmada fresca. Sirve para renovar la URL de
 * una imagen que el cliente cacheó: las firmas caducan, los ids no.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(req, "media:read");
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const result = await getMedia(createServiceClient(), guard.ctx, id);
  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data }, guard.headers);
}
