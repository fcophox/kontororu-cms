import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { signLocations, type MediaLocation } from "@/lib/storage/factory";
import type { StorageProvider } from "@/lib/storage/adapter";
import type { TenantBranding } from "./branding";

/**
 * El logo y el favicon del tenant viven en un bucket privado, así que sólo se
 * pueden pintar con una URL firmada, y toda URL firmada caduca.
 *
 * Guardarla en `tenants.branding` —como hacía la primera versión— convierte la
 * marca del cliente en una bomba de relojería: el logo se ve los días que dure
 * la firma y después el dashboard entero sirve una imagen rota, con un 400 del
 * optimizador de Next como única pista. Por eso lo persistente es el id en
 * `media` y la URL se firma aquí, en cada lectura.
 */

/**
 * Un día. La URL no se guarda en ningún sitio: vive lo que dure el HTML que la
 * contiene. Se firma holgado sólo para que una pestaña abierta toda la jornada
 * no se quede sin logo.
 */
const BRANDING_URL_TTL = 60 * 60 * 24;

/**
 * `.../storage/v1/object/sign/<bucket>/<ruta>?token=...`
 *
 * Recupera la ruta de las marcas guardadas antes de que existiera
 * `logoMediaId`: sin esto, cada cliente con logo tendría que volver a subirlo.
 */
const STORAGE_OBJECT_RE =
  /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/;

function legacyLocation(url: string | null): MediaLocation | null {
  if (!url) return null;
  const match = STORAGE_OBJECT_RE.exec(url);
  if (!match) return null;
  return { provider: "SUPABASE", bucket: match[1], path: decodeURIComponent(match[2]) };
}

type MediaRow = { id: string; bucket: string; path: string; provider: string | null };

function toLocation(row: MediaRow): MediaLocation {
  return {
    // `provider` puede faltar en filas antiguas: se asume Supabase, que es
    // donde estaba todo antes de existir esta columna.
    provider: (row.provider as StorageProvider | null) ?? "SUPABASE",
    bucket: row.bucket,
    path: row.path,
  };
}

/** El `media` se busca acotado al tenant: un id de otro espacio escrito a mano
 *  en el JSONB no debe firmar nada. */
async function lookup(
  db: SupabaseClient,
  tenantId: string,
  column: "id" | "path",
  values: string[],
): Promise<Map<string, MediaRow>> {
  const found = new Map<string, MediaRow>();
  if (values.length === 0) return found;

  const { data } = await db
    .from("media")
    .select("id, bucket, path, provider")
    .eq("tenant_id", tenantId)
    .in(column, values);

  for (const row of (data ?? []) as MediaRow[]) found.set(row[column], row);
  return found;
}

/**
 * Sustituye `logoUrl` y `faviconUrl` por URLs firmadas vigentes.
 *
 * De paso recupera el id de las marcas que aún guardan una URL: así el
 * formulario lo recibe y el JSONB se cura solo al siguiente guardado, sin
 * migración de datos. Lo que no se pueda resolver se devuelve como `null` —
 * sin logo se pinta la inicial del tenant, que es mejor que un recuadro roto.
 */
export async function resolveBrandingMedia(
  branding: TenantBranding,
  tenantId: string,
): Promise<TenantBranding> {
  const legacy = {
    logo: branding.logoMediaId ? null : legacyLocation(branding.logoUrl),
    favicon: branding.faviconMediaId ? null : legacyLocation(branding.faviconUrl),
  };

  const ids = [branding.logoMediaId, branding.faviconMediaId].filter(
    (id): id is string => id !== null,
  );
  const paths = [legacy.logo?.path, legacy.favicon?.path].filter(
    (path): path is string => path !== undefined,
  );

  if (ids.length === 0 && paths.length === 0) {
    return { ...branding, logoUrl: null, faviconUrl: null };
  }

  const service = createServiceClient();
  const [byId, byPath] = await Promise.all([
    lookup(service, tenantId, "id", ids),
    lookup(service, tenantId, "path", paths),
  ]);

  const resolve = (mediaId: string | null, fallback: MediaLocation | null) => {
    if (mediaId) {
      const row = byId.get(mediaId);
      return { id: mediaId, location: row ? toLocation(row) : null };
    }
    if (!fallback) return { id: null, location: null };
    const row = byPath.get(fallback.path);
    // Sin fila en `media` la ruta sigue sirviendo para firmar: el archivo está
    // en el bucket aunque su registro se haya perdido.
    return { id: row?.id ?? null, location: row ? toLocation(row) : fallback };
  };

  const logo = resolve(branding.logoMediaId, legacy.logo);
  const favicon = resolve(branding.faviconMediaId, legacy.favicon);

  const locations = [logo.location, favicon.location].filter(
    (loc): loc is MediaLocation => loc !== null,
  );

  // Firmar puede fallar (el archivo ya no está, el proveedor no responde): el
  // dashboard tiene que seguir cargando sin logo, no caerse por la marca.
  const urls =
    locations.length > 0
      ? await signLocations(service, locations, BRANDING_URL_TTL).catch(
          () => new Map<string, string>(),
        )
      : new Map<string, string>();

  return {
    ...branding,
    logoMediaId: logo.id,
    faviconMediaId: favicon.id,
    logoUrl: logo.location ? (urls.get(logo.location.path) ?? null) : null,
    faviconUrl: favicon.location ? (urls.get(favicon.location.path) ?? null) : null,
  };
}
