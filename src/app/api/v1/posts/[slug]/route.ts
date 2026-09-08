import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readFallback } from "@/lib/api/response";
import { getPost } from "@/lib/api/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/posts/[slug]
 *   ?locale=en&fallback=1
 *
 * Detalle con el cuerpo del contenido. Es lo que necesita una página de
 * artículo: `content.html` para inyectar directamente, `content.json` para
 * quien prefiera recorrer el documento y renderizar sus propios componentes.
 *
 * Toda la resolución —respaldo de idioma y el segundo intento por grupo
 * cuando el slug viene en otro idioma— vive en `lib/api/queries`, compartida
 * con GraphQL. Son reglas de visibilidad de contenido publicado, y tenerlas
 * en un solo sitio es lo que impide que una de las dos vías acabe sirviendo
 * un borrador.
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

  const { slug } = await params;
  const url = new URL(req.url);

  const result = await getPost(createServiceClient(), guard.ctx, {
    slug,
    locale: url.searchParams.get("locale"),
    fallback: readFallback(url),
  });

  if (!result.ok) return apiError(result.code, result.message);

  return apiJson({ data: result.data }, guard.headers);
}
