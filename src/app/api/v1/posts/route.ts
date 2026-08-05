import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight } from "@/lib/api/response";
import { listPosts } from "@/lib/api/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/posts
 *   ?category=blog&tag=nextjs&q=fintech&limit=20&cursor=<publishedAt>
 *
 * Listado de contenido publicado del tenant dueño de la API Key. No incluye
 * el cuerpo: para eso está /api/v1/posts/[slug].
 *
 * La consulta vive en `lib/api/queries`; aquí sólo se traduce entre HTTP y esa
 * capa, porque GraphQL sirve exactamente lo mismo por otro transporte.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);

  const result = await listPosts(createServiceClient(), guard.ctx, {
    locale: url.searchParams.get("locale"),
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    category: url.searchParams.get("category"),
    tag: url.searchParams.get("tag"),
    q: url.searchParams.get("q"),
  });

  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data.items, pagination: result.data.pagination }, guard.headers);
}
