import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildObjectPath,
  type PutInput,
  type PutResult,
  type StorageAdapter,
} from "./adapter";

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly provider = "SUPABASE" as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string = "tenant-media",
  ) {}

  async put({ tenantId, file, filename, contentType }: PutInput): Promise<PutResult> {
    const path = buildObjectPath(tenantId, filename);
    const { error } = await this.client.storage.from(this.bucket).upload(path, file, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error(`storage.put failed: ${error.message}`);

    const sizeBytes =
      file instanceof Blob ? file.size : (file as Uint8Array).byteLength;

    return { bucket: this.bucket, path, sizeBytes };
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage.remove failed: ${error.message}`);
  }

  /** Supabase firma el lote entero en una sola petición. */
  async signedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds = 3600,
  ): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (paths.length === 0) return urls;

    const { data } = await this.client.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds);

    for (const signed of data ?? []) {
      // Cada elemento trae su propio `error` si el objeto no existe.
      if (signed.path && signed.signedUrl) urls.set(signed.path, signed.signedUrl);
    }
    return urls;
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`storage.signedUrl failed: ${error?.message}`);
    return data.signedUrl;
  }

  publicUrl(bucket: string, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}
