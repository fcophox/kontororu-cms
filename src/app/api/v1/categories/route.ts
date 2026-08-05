import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { listCategories } from "@/lib/api/queries";

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

  const url = new URL(req.url);

  const result = await listCategories(createServiceClient(), guard.ctx, {
    locale: url.searchParams.get("locale"),
    kind: url.searchParams.get("kind"),
  });

  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data }, guard.headers);
}
