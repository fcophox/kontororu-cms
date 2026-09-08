import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiContext } from "./authenticate";
import { clampLimit, resolveLocale, type ApiErrorCode } from "./response";
import { attachTranslations, fetchTranslations } from "./translations";
import { refreshContentMedia } from "./content-media";
import { reportError } from "@/lib/observability/report";
import {
  collectMedia,
  serializeCategory,
  serializePost,
  signMediaBatch,
  SIGNED_URL_TTL,
  type ApiCategory,
  type ApiPost,
} from "./serializers";

/**
 * Capa de lectura de la API pública.
 *
 * Aquí vive lo que antes estaba dentro de cada route handler: la consulta, los
 * filtros, la firma de medios y la serialización. Las rutas REST y los
 * resolvers de GraphQL son dos fachadas sobre estas mismas funciones.
 *
 * El motivo no es ahorrar líneas: es que GraphQL se anunció como envoltorio de
 * la API que ya existe, y un envoltorio que reimplementa las consultas deja de
 * serlo en la primera corrección que sólo se aplica a un lado. Un `?category=`
 * sin `!inner`, un idioma que se resuelve distinto o un `deleted_at` olvidado
 * serían bugs que aparecen por un transporte y no por el otro.
 *
 * Por eso estas funciones no conocen `Request`, `Response` ni `URL`: reciben
 * parámetros ya extraídos y devuelven datos o un fallo con código, y es cada
 * fachada la que traduce ese código a un status HTTP o a un error GraphQL.
 */

export type QueryFailure = { ok: false; code: ApiErrorCode; message: string };
export type QueryResult<T> = { ok: true; data: T } | QueryFailure;

function fail(code: ApiErrorCode, message: string): QueryFailure {
  return { ok: false, code, message };
}

export type Page<T> = {
  items: T[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------

export type ListPostsParams = {
  locale?: string | null;
  /**
   * Servir el idioma principal del espacio cuando falte la traducción.
   *
   * Sin esto, una entrada sin traducir simplemente desaparece del listado en
   * `?locale=en`, y la web del cliente muestra un hueco donde hay contenido.
   */
  fallback?: boolean | null;
  limit?: unknown;
  cursor?: string | null;
  category?: string | null;
  tag?: string | null;
  q?: string | null;
};

/**
 * Idiomas a consultar, por orden de preferencia.
 *
 * Uno solo si no hay respaldo o si el pedido ya es el principal; en ese caso
 * pedir los dos traería las mismas filas dos veces.
 */
function preferredLocales(locale: string, defaultLocale: string, fallback?: boolean | null) {
  return fallback && locale !== defaultLocale ? [locale, defaultLocale] : [locale];
}

/**
 * Deja UNA fila por contenido: la del idioma pedido si existe, si no la otra.
 *
 * El orden de las claves de un Map es el de su primera inserción, así que
 * sustituir el español por el inglés no mueve el contenido de sitio en el
 * feed: sigue donde lo puso su `published_at`.
 */
function collapseByGroup(
  rows: Record<string, unknown>[],
  preferred: string,
): Record<string, unknown>[] {
  const byGroup = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const group = String(row.translation_group_id);
    const current = byGroup.get(group);
    if (!current || (current.locale !== preferred && row.locale === preferred)) {
      byGroup.set(group, row);
    }
  }

  return [...byGroup.values()];
}

/**
 * Listado de contenido publicado del tenant dueño de la API Key.
 *
 * No incluye el cuerpo: para eso está `getPost`. Devolver el HTML de cada
 * entrada en un listado de 100 multiplica el peso de la respuesta sin que
 * nadie lo use para pintar una portada.
 */
export async function listPosts(
  db: SupabaseClient,
  ctx: ApiContext,
  params: ListPostsParams,
): Promise<QueryResult<Page<ApiPost>>> {
  const locale = resolveLocale(params.locale, ctx);
  if ("error" in locale) return fail("bad_request", locale.error);

  const limit = clampLimit(params.limit);
  const { cursor, category, tag, q } = params;

  /*
   * Con respaldo se piden los dos idiomas y se colapsa después por grupo.
   *
   * No hay forma de decirle a PostgREST "el inglés de este contenido y, si no
   * lo hay, el español": eso es un DISTINCT ON por grupo, y la API REST no lo
   * expone. Traer las dos filas y quedarse con una en memoria cuesta como
   * mucho el doble de filas en una página; una consulta por grupo sería N+1.
   */
  const localeSet = preferredLocales(locale.locale, ctx.defaultLocale, params.fallback);

  /*
   * `!inner` NO es opcional en los embeds que se filtran.
   *
   * Sin él, PostgREST aplica el filtro al recurso ANIDADO en vez de al padre:
   * `?category=inexistente` devolvía todos los posts con `category: null` en
   * lugar de ninguno. El filtro parecía funcionar y no filtraba nada.
   *
   * El embed se pide `!inner` sólo cuando hay filtro; si fuese siempre,
   * desaparecerían los posts sin categoría.
   */
  const categoryEmbed = category
    ? "category:categories!inner(id, slug, name, kind)"
    : "category:categories(id, slug, name, kind)";
  const tagEmbed = tag
    ? "tags:post_tags!inner(tag:tags!inner(id, slug, name))"
    : "tags:post_tags(tag:tags(id, slug, name))";

  let query = db
    .from("posts")
    .select(
      `id, slug, locale, translation_group_id, title, excerpt, custom_fields, published_at, updated_at, seo, reading_time,
       ${categoryEmbed},
       cover:media!posts_cover_media_id_fkey(id, bucket, path, provider, alt_text, width, height),
       ${tagEmbed}`,
    )
    // Filtro de tenant explícito: el service role no aplica RLS.
    .eq("tenant_id", ctx.tenantId)
    .in("locale", localeSet)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    // Cada grupo aporta como mucho una fila por idioma pedido, así que pedir el
    // doble garantiza que tras colapsar sigue habiendo `limit + 1` contenidos
    // distintos con los que decidir si hay página siguiente.
    .limit((limit + 1) * localeSet.length);

  if (cursor) query = query.lt("published_at", cursor);
  if (category) query = query.eq("categories.slug", category);
  if (tag) query = query.eq("post_tags.tags.slug", tag);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    reportError(error, { scope: "api.listPosts" });
    return fail("server_error", "No se pudo recuperar el contenido.");
  }

  const collapsed = collapseByGroup(
    data as unknown as Record<string, unknown>[],
    locale.locale,
  );

  const hasMore = collapsed.length > limit;
  const rows = hasMore ? collapsed.slice(0, limit) : collapsed;

  const [urls, byGroup] = await Promise.all([
    signMediaBatch(db, collectMedia(rows)),
    fetchTranslations(db, ctx.tenantId, rows.map((r) => String(r.translation_group_id))),
  ]);
  attachTranslations(rows, byGroup);

  return {
    ok: true,
    data: {
      items: rows.map((row) => serializePost(row, urls)),
      pagination: {
        hasMore,
        nextCursor: hasMore ? ((rows.at(-1)?.published_at as string) ?? null) : null,
      },
    },
  };
}

/**
 * Cuántas filas de más se traen al buscar por grupo sin filtrar idioma.
 *
 * Un grupo tiene una fila por idioma activo del espacio, que son pocos. El
 * tope existe para que la consulta de respaldo no crezca sin límite si algún
 * día alguien activa veinte.
 */
const MAX_FALLBACK_LOCALES = 10;

/**
 * Trae UNA entrada publicada de un idioma, buscada por slug o por grupo.
 *
 * Las dos búsquedas comparten el mismo `select` y las mismas condiciones de
 * visibilidad. Tenerlas en una sola función evita que la vía de respaldo
 * —resolver por grupo— se relaje con el tiempo y acabe sirviendo un borrador.
 */
async function fetchPublishedPost(
  db: SupabaseClient,
  tenantId: string,
  /** Idiomas por orden de preferencia: el pedido primero. */
  prefer: string[],
  by: { slug: string } | { groupId: string },
  opts: { anyLocale?: boolean } = {},
): Promise<{ data: unknown } | { error: unknown }> {
  let query = db
    .from("posts")
    .select(
      `id, slug, locale, translation_group_id, title, excerpt, content_html, content_json, custom_fields,
       published_at, updated_at, seo, reading_time,
       category:categories(id, slug, name, kind),
       cover:media!posts_cover_media_id_fkey(id, bucket, path, provider, alt_text, width, height),
       tags:post_tags(tag:tags(id, slug, name))`,
    )
    // El tenant sale de la clave, nunca de la petición: dos clientes pueden
    // tener el mismo slug y cada uno debe recibir el suyo.
    .eq("tenant_id", tenantId)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());

  // El mismo slug puede existir en varios idiomas, así que la consulta puede
  // traer varias filas: se ordenan por preferencia aquí abajo en vez de
  // dejárselo a un `maybeSingle()` que fallaría con una traducción homónima.
  if (!opts.anyLocale) query = query.in("locale", prefer);

  query = "slug" in by
    ? query.eq("slug", by.slug)
    : query.eq("translation_group_id", by.groupId);

  const { data, error } = await query.limit(prefer.length + MAX_FALLBACK_LOCALES);
  if (error) return { error };

  const rows = (data ?? []) as { locale: string }[];
  const match = prefer.map((l) => rows.find((r) => r.locale === l)).find(Boolean);

  return { data: match ?? rows[0] ?? null };
}

export type GetPostParams = {
  slug: string;
  locale?: string | null;
  fallback?: boolean | null;
};

/**
 * Detalle con el cuerpo del contenido.
 *
 * Es lo que necesita una página de artículo: `content.html` para inyectar
 * directamente, `content.json` para quien prefiera recorrer el documento y
 * renderizar sus propios componentes.
 */
export async function getPost(
  db: SupabaseClient,
  ctx: ApiContext,
  params: GetPostParams,
): Promise<QueryResult<ApiPost>> {
  const locale = resolveLocale(params.locale, ctx);
  if ("error" in locale) return fail("bad_request", locale.error);

  /*
   * Orden de preferencia: el idioma pedido y, si el contenido no está
   * traducido, el principal del espacio. Sin respaldo la lista tiene un solo
   * idioma y una traducción que falta vuelve a ser un 404.
   */
  const prefer = preferredLocales(locale.locale, ctx.defaultLocale, params.fallback);

  const first = await fetchPublishedPost(db, ctx.tenantId, prefer, { slug: params.slug });
  if ("error" in first) {
    reportError(first.error, { scope: "api.getPost" });
    return fail("server_error", "No se pudo recuperar el contenido.");
  }

  /*
   * Segundo intento: el slug puede venir en otro idioma.
   *
   * El visitante está en /blog/mi-articulo y pulsa "EN". Su navegador sólo
   * conoce el slug español, y el inglés es otro. Sin esto, cambiar de idioma
   * en la web devolvía 404 salvo que el front hubiera guardado antes el mapa
   * de traducciones.
   *
   * Se paga sólo cuando la primera consulta no encuentra nada. La respuesta
   * lleva el slug real del contenido, así que el front puede redirigir a su
   * URL canónica.
   */
  let data = first.data;
  if (!data) {
    const { data: sibling } = await db
      .from("posts")
      .select("translation_group_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("slug", params.slug)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (sibling) {
      const retry = await fetchPublishedPost(
        db,
        ctx.tenantId,
        prefer,
        { groupId: sibling.translation_group_id },
        // Resuelto ya el grupo, el respaldo se estira a CUALQUIER idioma
        // publicado: un contenido que sólo existe en francés se sirve en
        // francés antes que devolver un 404 por algo que sí está publicado.
        { anyLocale: Boolean(params.fallback) },
      );
      if ("error" in retry) {
        reportError(retry.error, { scope: "api.getPost" });
        return fail("server_error", "No se pudo recuperar el contenido.");
      }
      data = retry.data;
    }
  }

  // Un borrador y un slug inexistente devuelven lo mismo: que exista un
  // borrador con ese nombre no es información pública.
  if (!data) {
    return fail(
      "not_found",
      `No hay contenido publicado en "${params.slug}" (idioma ${locale.locale}).`,
    );
  }

  const row = data as unknown as Record<string, unknown>;

  // Las imágenes del cuerpo se vuelven a firmar aquí: el `src` guardado en el
  // documento caduca, así que servirlo tal cual degradaría el contenido con
  // el tiempo sin que nadie se entere.
  const [urls, content, byGroup] = await Promise.all([
    signMediaBatch(db, collectMedia([row])),
    refreshContentMedia(db, ctx.tenantId, {
      html: String(row.content_html ?? ""),
      json: row.content_json ?? { type: "doc", content: [] },
    }),
    fetchTranslations(db, ctx.tenantId, [String(row.translation_group_id)]),
  ]);
  attachTranslations([row], byGroup);

  row.content_html = content.html;
  row.content_json = content.json;

  return { ok: true, data: serializePost(row, urls, { withContent: true }) };
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export const CATEGORY_KINDS = ["BLOG", "CASE_STUDY", "SERVICE", "CUSTOM"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * Las categorías ya no llevan idioma: son transversales al espacio. Lo que
 * `locale` acota aquí es el CONTEO, no el listado.
 */
export type ApiCategoryWithCount = NonNullable<ApiCategory> & {
  parentId: string | null;
  postCount: number;
};

/**
 * Categorías con el conteo de entradas publicadas.
 *
 * El conteo es lo que permite a la web del cliente montar un menú sin enlazar
 * a categorías vacías.
 */
export async function listCategories(
  db: SupabaseClient,
  ctx: ApiContext,
  params: { locale?: string | null; fallback?: boolean | null; kind?: string | null },
): Promise<QueryResult<ApiCategoryWithCount[]>> {
  // Se estrecha al enum antes de tocar la consulta: así el tipo generado
  // valida el filtro y un `kind` inventado da 400 en vez de un 500 opaco.
  const rawKind = params.kind ?? null;
  if (rawKind && !(CATEGORY_KINDS as readonly string[]).includes(rawKind)) {
    return fail("bad_request", `"kind" debe ser uno de: ${CATEGORY_KINDS.join(", ")}.`);
  }
  const kind = rawKind as CategoryKind | null;

  /*
   * Las categorías ya no tienen idioma, pero `locale` se sigue admitiendo:
   * acota el CONTEO de entradas. "Cuántos artículos publicados en inglés hay
   * en esta categoría" sigue siendo una pregunta con sentido, y devolver el
   * total mezclando idiomas descuadraría cualquier portada.
   */
  const locale = resolveLocale(params.locale, ctx);
  if ("error" in locale) return fail("bad_request", locale.error);

  /*
   * El conteo cuenta lo mismo que devuelve el listado.
   *
   * Con respaldo, `/posts?locale=en` sirve el español de lo que no está
   * traducido; si aquí se contara sólo el inglés, el menú diría "0" junto a
   * una categoría que al abrirla tiene entradas. Se cuentan CONTENIDOS, no
   * filas: el grupo que existe en los dos idiomas vale uno.
   */
  const localeSet = preferredLocales(locale.locale, ctx.defaultLocale, params.fallback);

  let query = db
    .from("categories")
    .select("id, slug, name, kind, description, position, parent_id")
    .eq("tenant_id", ctx.tenantId)
    .order("position");

  if (kind) query = query.eq("kind", kind);

  const [{ data: categories, error }, { data: posts, error: postsError }] = await Promise.all([
    query,
    // Los conteos se traen en una sola consulta y se agregan en memoria:
    // una subconsulta por categoría sería N+1 contra la base.
    db
      .from("posts")
      .select("category_id, translation_group_id")
      .eq("tenant_id", ctx.tenantId)
      .in("locale", localeSet)
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .lte("published_at", new Date().toISOString()),
  ]);

  if (error || postsError) {
    reportError(error ?? postsError, { scope: "api.listCategories" });
    return fail("server_error", "No se pudieron recuperar las categorías.");
  }

  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const p of posts ?? []) {
    if (!p.category_id) continue;
    if (seen.has(p.translation_group_id)) continue;
    seen.add(p.translation_group_id);
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }

  return {
    ok: true,
    data: (categories ?? []).map((c) => ({
      ...serializeCategory(c)!,
      parentId: c.parent_id,
      postCount: counts.get(c.id) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Medios
// ---------------------------------------------------------------------------

export const MEDIA_TYPE_PREFIXES: Record<string, string> = {
  image: "image/",
  video: "video/",
  document: "application/",
};

export type ApiMediaFile = {
  id: string;
  url: string;
  alt: string | null;
  /** No admiten nulo en la base, y el esquema GraphQL los declara obligatorios. */
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Segundos de validez de `url`. Pasado ese plazo hay que volver a pedirla. */
  expiresIn: number;
};

/**
 * La biblioteca de archivos del espacio.
 *
 * Permite montar una galería o un selector de imágenes en la web del cliente
 * sin pasar por los posts. Requiere `media:read`, separado de `content:read`:
 * una clave que sólo alimenta un blog no tiene por qué poder enumerar todos
 * los archivos subidos, incluidos los que aún no se han usado en ninguna parte.
 */
export async function listMedia(
  db: SupabaseClient,
  ctx: ApiContext,
  params: { limit?: unknown; cursor?: string | null; type?: string | null },
): Promise<QueryResult<Page<ApiMediaFile>>> {
  const limit = clampLimit(params.limit);
  const { cursor, type } = params;

  if (type && !MEDIA_TYPE_PREFIXES[type]) {
    return fail(
      "bad_request",
      `"type" debe ser uno de: ${Object.keys(MEDIA_TYPE_PREFIXES).join(", ")}.`,
    );
  }

  let query = db
    .from("media")
    .select("id, bucket, path, provider, mime_type, size_bytes, width, height, alt_text, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (type) query = query.like("mime_type", `${MEDIA_TYPE_PREFIXES[type]}%`);

  const { data, error } = await query;
  if (error) {
    reportError(error, { scope: "api.listMedia" });
    return fail("server_error", "No se pudieron recuperar los archivos.");
  }

  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const urls = await signMediaBatch(db, rows);

  return {
    ok: true,
    data: {
      items: rows
        // Un archivo cuyo objeto ya no está en Storage se omite: es preferible
        // a devolver una entrada con `url: null` que el cliente tendría que
        // filtrar en cada consumo.
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
          expiresIn: SIGNED_URL_TTL,
        })),
      pagination: {
        hasMore,
        nextCursor: hasMore ? (rows.at(-1)?.created_at ?? null) : null,
      },
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un archivo concreto con URL firmada fresca.
 *
 * Sirve para renovar la URL de una imagen que el cliente cacheó: las firmas
 * caducan, los ids no.
 */
export async function getMedia(
  db: SupabaseClient,
  ctx: ApiContext,
  id: string,
): Promise<QueryResult<ApiMediaFile>> {
  // Sin esto, un id malformado llega a Postgres y vuelve como error de
  // sintaxis: un 500 donde corresponde un 400.
  if (!UUID.test(id)) return fail("bad_request", "El identificador no es válido.");

  const { data, error } = await db
    .from("media")
    .select("id, bucket, path, provider, mime_type, size_bytes, width, height, alt_text, created_at")
    // El tenant sale de la clave: pedir el id de otro cliente da 404, no su archivo.
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    reportError(error, { scope: "api.getMedia" });
    return fail("server_error", "No se pudo recuperar el archivo.");
  }
  if (!data) return fail("not_found", "No existe ese archivo.");

  const urls = await signMediaBatch(db, [data]);
  const url = urls.get(data.path);

  // La fila existe pero el objeto no está en Storage: un 404 sería engañoso
  // —el archivo consta en la biblioteca— y un 200 con `url: null` obligaría
  // al cliente a comprobarlo siempre.
  if (!url) {
    return fail("server_error", "El archivo ya no está disponible en el almacenamiento.");
  }

  return {
    ok: true,
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
  };
}
