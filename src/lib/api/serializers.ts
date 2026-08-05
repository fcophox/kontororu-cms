import type { SupabaseClient } from "@supabase/supabase-js";
import { CACHE_SECONDS, STALE_SECONDS } from "./response";
import { signLocations } from "@/lib/storage/factory";
import type { StorageProvider } from "@/lib/storage/adapter";

/**
 * Forma pública del contenido.
 *
 * Lo que sale por aquí es contrato con las webs de los clientes: cambiar un
 * nombre de campo rompe sus builds. Por eso se serializa explícitamente en
 * lugar de devolver la fila de Postgres — así renombrar una columna interna
 * no se filtra a la API, y se ve de un vistazo qué se expone y qué no.
 */

/**
 * Las URLs firmadas deben sobrevivir a la caché que las contiene.
 *
 * Si la respuesta se cachea 60 s y puede servirse obsoleta 10 min, una URL de
 * 5 min llegaría caducada a un lector legítimo: imágenes rotas en la web del
 * cliente sin ningún error visible en el CMS. Se firma para 24 h, muy por
 * encima de la ventana de caché.
 */
export const SIGNED_URL_TTL = 60 * 60 * 24;

if (SIGNED_URL_TTL <= CACHE_SECONDS + STALE_SECONDS) {
  throw new Error("SIGNED_URL_TTL debe superar la ventana de caché de la API");
}

type MediaRow = {
  id: string;
  bucket: string;
  path: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  mime_type?: string | null;
  /** Dónde vive ESTE archivo, no dónde vive el tenant hoy. */
  provider?: StorageProvider | null;
} | null;

export type ApiMedia = {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
} | null;

/**
 * Firma las rutas de Storage en lote, sea cual sea su proveedor.
 *
 * El bucket es privado: devolver `bucket` y `path` en crudo —como hacía la
 * primera versión— le da al cliente dos strings con los que no puede hacer
 * nada.
 *
 * Ya no habla con Supabase directamente: durante una migración a S3 conviven
 * archivos en ambos sitios, y quien serializa un post no tiene por qué saber
 * dónde acabó cada imagen.
 */
export async function signMediaBatch(
  db: SupabaseClient,
  media: NonNullable<MediaRow>[],
): Promise<Map<string, string>> {
  if (media.length === 0) return new Map();

  return signLocations(
    db,
    media.map((item) => ({
      // `provider` puede faltar en filas antiguas: se asume Supabase, que es
      // donde estaba todo antes de existir esta columna.
      provider: item.provider ?? "SUPABASE",
      bucket: item.bucket,
      path: item.path,
    })),
    SIGNED_URL_TTL,
  );
}

export function serializeMedia(row: MediaRow, urls: Map<string, string>): ApiMedia {
  if (!row) return null;
  const url = urls.get(row.path);
  // Sin URL firmada es preferible omitir la portada que devolver una rota.
  if (!url) return null;

  return {
    id: row.id,
    url,
    alt: row.alt_text,
    width: row.width,
    height: row.height,
  };
}

export type ApiCategory = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  description?: string | null;
} | null;

export function serializeCategory(row: unknown): ApiCategory {
  if (!row || typeof row !== "object") return null;
  const c = row as Record<string, unknown>;
  return {
    id: String(c.id),
    slug: String(c.slug),
    name: String(c.name),
    kind: String(c.kind),
    ...(c.description !== undefined ? { description: (c.description as string) ?? null } : {}),
  };
}

export type ApiTag = { id: string; slug: string; name: string };

/** `post_tags` llega como `[{ tag: {...} }]`; se aplana a la lista útil. */
export function serializeTags(rows: unknown): ApiTag[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (r as { tag?: unknown }).tag)
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
    .map((t) => ({ id: String(t.id), slug: String(t.slug), name: String(t.name) }));
}

export type ApiPost = {
  id: string;
  slug: string;
  locale: string;
  /**
   * Las otras versiones de este mismo contenido, `idioma -> slug`.
   * Es lo que permite montar el selector de idioma y las etiquetas
   * `hreflang` sin una segunda petición por traducción.
   */
  translations: Record<string, string>;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingTime: number | null;
  seo: unknown;
  customFields: unknown;
  category: ApiCategory;
  cover: ApiMedia;
  tags: ApiTag[];
  /** Sólo en el detalle: el listado no lleva cuerpo. */
  content?: { html: string; json: unknown };
};

export function serializePost(
  row: Record<string, unknown>,
  urls: Map<string, string>,
  options: { withContent?: boolean } = {},
): ApiPost {
  const post: ApiPost = {
    id: String(row.id),
    slug: String(row.slug),
    locale: String(row.locale ?? "es"),
    translations: asTranslations(row.translations),
    title: String(row.title),
    excerpt: (row.excerpt as string) ?? null,
    publishedAt: (row.published_at as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
    readingTime: (row.reading_time as number) ?? null,
    seo: row.seo ?? {},
    customFields: row.custom_fields ?? {},
    category: serializeCategory(row.category),
    cover: serializeMedia(row.cover as MediaRow, urls),
    tags: serializeTags(row.tags),
  };

  if (options.withContent) {
    post.content = {
      html: String(row.content_html ?? ""),
      json: row.content_json ?? { type: "doc", content: [] },
    };
  }

  return post;
}

/**
 * `translations` llega como `[{ locale, slug }]` desde el embed sobre el
 * propio `posts`; se convierte en el mapa que consume una web.
 */
function asTranslations(rows: unknown): Record<string, string> {
  if (!Array.isArray(rows)) return {};
  const map: Record<string, string> = {};
  for (const row of rows) {
    const r = row as { locale?: unknown; slug?: unknown };
    if (typeof r.locale === "string" && typeof r.slug === "string") {
      map[r.locale] = r.slug;
    }
  }
  return map;
}

/** Extrae las filas de media de una página de posts, para firmarlas juntas. */
export function collectMedia(rows: Record<string, unknown>[]): NonNullable<MediaRow>[] {
  return rows
    .map((r) => r.cover as MediaRow)
    .filter((m): m is NonNullable<MediaRow> => Boolean(m));
}
