/**
 * Adapter Pattern de almacenamiento.
 * Hoy: Supabase Storage. Mañana: S3 / Cloudflare R2 sin tocar el editor
 * ni las route handlers — sólo se registra otra implementación.
 *
 * Invariante: la ruta física SIEMPRE empieza por `<tenantId>/`.
 * Está además reforzada por un CHECK constraint en la tabla `media`
 * y por las políticas RLS de `storage.objects`.
 */

export type StorageProvider = "SUPABASE" | "S3" | "R2";

export type PutInput = {
  tenantId: string;
  file: Blob | Buffer | Uint8Array;
  filename: string;
  contentType: string;
};

export type PutResult = {
  bucket: string;
  path: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  readonly provider: StorageProvider;
  put(input: PutInput): Promise<PutResult>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** URL firmada temporal (buckets privados). */
  signedUrl(bucket: string, path: string, expiresInSeconds?: number): Promise<string>;
  /**
   * Firma varias rutas de golpe.
   *
   * Está en la interfaz —y no resuelto con un bucle de `signedUrl`— porque el
   * coste depende del proveedor: en Supabase es UNA petición HTTP para todas,
   * mientras que en S3 firmar es cálculo local y el bucle no cuesta red. Sin
   * este método, un listado de 100 posts haría 100 llamadas a Supabase.
   *
   * Devuelve un mapa `path -> url`. Las rutas que no se puedan firmar
   * (objeto ausente, permisos) se omiten en vez de devolver una URL rota.
   */
  signedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds?: number,
  ): Promise<Map<string, string>>;
  /** URL pública/CDN para contenido ya publicado. */
  publicUrl(bucket: string, path: string): string;
}

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/** `<tenantId>/2026/08/<uuid>.<ext>` — jamás usa el nombre original del archivo. */
export function buildObjectPath(tenantId: string, filename: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rawExt = filename.split(".").pop()?.toLowerCase() ?? "";
  const ext = SAFE_EXT.test(rawExt) ? rawExt : "bin";
  return `${tenantId}/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;
}

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "video/mp4",
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
