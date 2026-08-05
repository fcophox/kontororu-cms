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

  const groups = new Map<string, { adapter: StorageAdapter; bucket: string; paths: string[] }>();

  for (const loc of locations) {
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

  await Promise.all(
    [...groups.values()].map(async ({ adapter, bucket, paths }) => {
      const signed = await adapter.signedUrls(bucket, paths, expiresInSeconds);
      for (const [path, url] of signed) urls.set(path, url);
    }),
  );

  return urls;
}
