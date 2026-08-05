import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, apiJson, corsPreflight, readLimit } from "@/lib/api/response";
import { signMediaBatch } from "@/lib/api/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/media
 *   ?type=image&limit=20&cursor=<createdAt>
 *
 * La biblioteca de archivos del espacio. Es lo que permite montar una galería
 * o un selector de imágenes en la web del cliente sin pasar por los posts.
 *
 * Requiere el permiso `media:read`, separado de `content:read`: una clave que
 * sólo alimenta un blog no tiene por qué poder enumerar todos los archivos
 * subidos, incluidos los que aún no se han usado en ninguna parte.
 */
export function OPTIONS() {
  return corsPreflight();
}

const TYPE_PREFIXES: Record<string, string> = {
  image: "image/",
  video: "video/",
  document: "application/",
};

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "media:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const url = new URL(req.url);
  const limit = readLimit(url);
  const cursor = url.searchParams.get("cursor");
  const type = url.searchParams.get("type");

  if (type && !TYPE_PREFIXES[type]) {
    return apiError(
      "bad_request",
      `"type" debe ser uno de: ${Object.keys(TYPE_PREFIXES).join(", ")}.`,
    );
  }

  const db = createServiceClient();

  let query = db
    .from("media")
    .select("id, bucket, path, provider, mime_type, size_bytes, width, height, alt_text, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (type) query = query.like("mime_type", `${TYPE_PREFIXES[type]}%`);

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/v1/media", error);
    return apiError("server_error", "No se pudieron recuperar los archivos.");
  }

  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const urls = await signMediaBatch(db, rows);

  return apiJson(
    {
      data: rows
        // Un archivo cuyo objeto ya no está en Storage se omite: es
        // preferible a devolver una entrada con `url: null` que el cliente
        // tendría que filtrar en cada consumo.
        .filter((row) => urls.has(row.path))
        .map((row) => ({
          id: row.id,
          url: urls.get(row.path)!,
          alt: row.alt_text,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          createdAt: row.created_at,
        })),
      pagination: {
        hasMore,
        nextCursor: hasMore ? (rows.at(-1)?.created_at ?? null) : null,
      },
    },
    guard.headers,
  );
}
