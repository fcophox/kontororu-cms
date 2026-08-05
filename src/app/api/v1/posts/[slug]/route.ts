import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { getPost } from "@/lib/api/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/posts/[slug]
 *
 * Detalle con el cuerpo del contenido: `content.html` para inyectar
 * directamente, `content.json` para quien prefiera recorrer el documento y
 * renderizar sus propios componentes.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;

  const { slug } = await params;

  const result = await getPost(createServiceClient(), guard.ctx, {
    slug,
    locale: new URL(req.url).searchParams.get("locale"),
  });

  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data }, guard.headers);
}
