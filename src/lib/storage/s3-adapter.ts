import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildObjectPath,
  type PutInput,
  type PutResult,
  type StorageAdapter,
  type StorageProvider,
} from "./adapter";

/**
 * Almacenamiento en S3 y en Cloudflare R2.
 *
 * Un solo adapter para los dos: R2 habla el protocolo S3, y las únicas
 * diferencias son el endpoint y que R2 ignora la región (por convención se le
 * pasa `auto`). Duplicar la clase para cambiar dos strings no aportaría nada.
 *
 * Se usa el SDK v3 y no `fetch` a mano porque firmar SigV4 correctamente
 * —incluyendo el orden canónico de cabeceras y el hash del payload— es de las
 * cosas que casi funcionan hasta que llega un nombre de archivo con acentos.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly provider: StorageProvider;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(config: {
    provider: "S3" | "R2";
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Obligatorio en R2 y en gateways compatibles; opcional en AWS. */
    endpoint?: string;
    /** Base del CDN, si el bucket sirve contenido público. */
    publicBaseUrl?: string;
  }) {
    this.provider = config.provider;
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl;

    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      /*
       * `forcePathStyle` porque el direccionamiento por subdominio
       * (bucket.host) exige DNS por bucket: no funciona contra un endpoint
       * local ni contra la mayoría de gateways compatibles. R2 y S3 aceptan
       * ambos estilos.
       */
      forcePathStyle: true,
    });
  }

  async put({ tenantId, file, filename, contentType }: PutInput): Promise<PutResult> {
    const path = buildObjectPath(tenantId, filename);
    const body = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file;
    const sizeBytes = body instanceof Uint8Array ? body.byteLength : (body as Buffer).length;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { bucket: this.bucket, path, sizeBytes };
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    // Una llamada para todo el lote: borrar 50 archivos no son 50 peticiones.
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: paths.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /**
   * Firmar en S3 es cálculo local: un HMAC sobre la petición canónica, sin
   * ida y vuelta a la red. Por eso el lote es un bucle y aun así es más
   * rápido que la llamada única de Supabase.
   */
  async signedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds = 3600,
  ): Promise<Map<string, string>> {
    const entries = await Promise.all(
      paths.map(async (path) => {
        try {
          return [path, await this.signedUrl(bucket, path, expiresInSeconds)] as const;
        } catch {
          // Se omite en vez de propagar: una firma fallida no debe tumbar el
          // listado entero de contenido.
          return null;
        }
      }),
    );

    return new Map(entries.filter((e): e is readonly [string, string] => e !== null));
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: path }),
      { expiresIn: expiresInSeconds },
    );
  }

  publicUrl(bucket: string, path: string): string {
    if (!this.publicBaseUrl) {
      throw new Error(
        "Este almacenamiento no tiene CDN configurado: usa signedUrl() o define la URL pública.",
      );
    }
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${path}`;
  }
}
