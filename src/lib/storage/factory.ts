import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter, StorageProvider } from "./adapter";
import { SupabaseStorageAdapter } from "./supabase-adapter";
import { S3StorageAdapter } from "./s3-adapter";

/**
 * Resuelve qué almacenamiento usar.
 *
 * El proveedor se decide **por archivo**, no por tenant: `media.provider`
 * guarda dónde se subió cada uno. Eso es lo que hace posible migrar sin
 * ventana de corte — se cambia `tenants.storage_provider` y los archivos
 * nuevos van a S3 mientras los viejos se siguen sirviendo desde Supabase.
 * Sin ese matiz, activar S3 rompería todas las imágenes existentes.
 */

/** Un adapter por combinación proveedor+bucket: crear un S3Client cuesta. */
const cache = new Map<string, StorageAdapter>();

function s3Config(provider: "S3" | "R2") {
  const prefix = provider === "R2" ? "R2" : "S3";

  const accessKeyId = process.env[`${prefix}_ACCESS_KEY_ID`];
  const secretAccessKey = process.env[`${prefix}_SECRET_ACCESS_KEY`];
  const endpoint = process.env[`${prefix}_ENDPOINT`];
  const region = process.env[`${prefix}_REGION`] ?? (provider === "R2" ? "auto" : "us-east-1");

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Almacenamiento ${provider} sin credenciales: faltan ${prefix}_ACCESS_KEY_ID y ${prefix}_SECRET_ACCESS_KEY.`,
    );
  }
  if (provider === "R2" && !endpoint) {
    throw new Error("R2 necesita R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com).");
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    region,
    publicBaseUrl: process.env[`${prefix}_PUBLIC_BASE_URL`],
  };
}

export function createStorageAdapter(
  provider: StorageProvider,
  bucket: string,
  supabase: SupabaseClient,
): StorageAdapter {
  const key = `${provider}:${bucket}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const adapter: StorageAdapter =
    provider === "SUPABASE"
      ? new SupabaseStorageAdapter(supabase, bucket)
      : new S3StorageAdapter({ provider, bucket, ...s3Config(provider) });

  // El adapter de Supabase lleva dentro un cliente atado a la sesión, así que
  // NO se cachea: reutilizarlo entre peticiones serviría archivos con las
  // credenciales de otro usuario.
  if (provider !== "SUPABASE") cache.set(key, adapter);

  return adapter;
}

export type MediaLocation = {
  provider: StorageProvider;
  bucket: string;
  path: string;
};

/**
 * Caché de URLs firmadas — el arreglo del egress.
 *
 * `createSignedUrls` devuelve un token distinto en CADA llamada, y se firmaba
 * en cada lectura. Para el navegador eso es una URL nueva en cada render, así
 * que su caché no acertaba nunca y volvía a descargar la imagen entera en cada
 * navegación. Los objetos se suben con `cache-control: 31536000`: eran
 * cacheables un año y lo único que lo impedía era la URL cambiante. Con 3 MB
 * de archivos, eso produjo 1,6 GB de egress en un solo día.
 *
 * Devolver la MISMA cadena durante una ventana estable es lo que permite que
 * trabajen la caché del navegador y el optimizador de Next.
 *
 * Cachear no concede acceso nuevo: la clave incluye la ruta, que empieza por el
 * id del tenant, y aquí sólo llegan filas que RLS ya dejó ver. Sin ese matiz
 * sería un agujero — la URL firmada vale para quien la tenga.
 */
const CACHE_WINDOW_SECONDS = 60 * 60;

/** Techo de memoria: es una caché de conveniencia, no un índice. */
const CACHE_MAX_ENTRIES = 5000;

const signedCache = new Map<string, { url: string; until: number }>();

function cacheKey(loc: MediaLocation): string {
  return `${loc.provider}:${loc.bucket}:${loc.path}`;
}

/**
 * La ventana nunca pasa de la mitad del TTL de la firma: una URL servida desde
 * caché justo antes de expirar llegaría al navegador ya inútil, y el usuario
 * vería la imagen rota sin que nada haya fallado.
 */
function windowMs(expiresInSeconds: number): number {
  return Math.min(CACHE_WINDOW_SECONDS, Math.floor(expiresInSeconds / 2)) * 1000;
}

function pruneCache(now: number): void {
  for (const [key, entry] of signedCache) {
    if (entry.until <= now) signedCache.delete(key);
  }
  // Si aún sobra, se tira lo más antiguo: Map conserva el orden de inserción.
  while (signedCache.size > CACHE_MAX_ENTRIES) {
    const oldest = signedCache.keys().next();
    if (oldest.done) break;
    signedCache.delete(oldest.value);
  }
}

/**
 * Firma un conjunto de archivos que pueden estar repartidos entre proveedores.
 *
 * Agrupa por proveedor+bucket y hace una llamada por grupo. Durante una
 * migración conviven ambos, y el llamante no debería tener que saberlo.
 */
export async function signLocations(
  supabase: SupabaseClient,
  locations: MediaLocation[],
  expiresInSeconds: number,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (locations.length === 0) return urls;

  const now = Date.now();
  const pending: MediaLocation[] = [];

  for (const loc of locations) {
    const hit = signedCache.get(cacheKey(loc));
    if (hit && hit.until > now) urls.set(loc.path, hit.url);
    else pending.push(loc);
  }

  if (pending.length === 0) return urls;

  const groups = new Map<string, { adapter: StorageAdapter; bucket: string; paths: string[] }>();

  for (const loc of pending) {
    const key = `${loc.provider}:${loc.bucket}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        adapter: createStorageAdapter(loc.provider, loc.bucket, supabase),
        bucket: loc.bucket,
        paths: [],
      };
      groups.set(key, group);
    }
    group.paths.push(loc.path);
  }

  const until = now + windowMs(expiresInSeconds);

  await Promise.all(
    [...groups.values()].map(async ({ adapter, bucket, paths }) => {
      const signed = await adapter.signedUrls(bucket, paths, expiresInSeconds);
      for (const [path, url] of signed) urls.set(path, url);
    }),
  );

  // Se cachea por proveedor+bucket+ruta, no sólo por ruta: el mismo archivo
  // puede existir en Supabase y en S3 durante una migración, y sus URLs no son
  // intercambiables.
  for (const loc of pending) {
    const url = urls.get(loc.path);
    if (url) signedCache.set(cacheKey(loc), { url, until });
  }

  pruneCache(now);

  return urls;
}
