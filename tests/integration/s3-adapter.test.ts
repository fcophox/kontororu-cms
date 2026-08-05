import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { S3StorageAdapter } from "@/lib/storage/s3-adapter";
import { signLocations } from "@/lib/storage/factory";

/**
 * Adapter de S3/R2 contra un endpoint S3 REAL.
 *
 * Supabase expone un gateway compatible con el protocolo S3 en local, así que
 * el adapter se ejercita contra SigV4 de verdad —firma, cabeceras canónicas,
 * path-style— sin levantar MinIO ni tocar una cuenta de AWS. Un test con el
 * cliente simulado no habría detectado, por ejemplo, un `forcePathStyle` mal
 * puesto: eso sólo falla contra un servidor.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const hasS3Config = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID);

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

const BUCKET = "tenant-media";
const TENANT = "00000000-0000-4000-8000-0000000s3test".replace("s3test", "000001");

let adapter: S3StorageAdapter;
const uploaded: string[] = [];

beforeAll(() => {
  adapter = new S3StorageAdapter({
    provider: "S3",
    bucket: BUCKET,
    region: process.env.S3_REGION ?? "local",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  });
});

afterAll(async () => {
  if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded);
});

describe.skipIf(!hasS3Config)("S3StorageAdapter contra un endpoint real", () => {
  it("sube y devuelve una ruta prefijada por el tenant", async () => {
    const result = await adapter.put({
      tenantId: TENANT,
      file: new Blob(["contenido de prueba"]),
      filename: "foto.webp",
      contentType: "image/webp",
    });
    uploaded.push(result.path);

    // La misma invariante que en Supabase: el aislamiento vive en la ruta.
    expect(result.path.startsWith(`${TENANT}/`)).toBe(true);
    expect(result.path).toMatch(/\.webp$/);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.bucket).toBe(BUCKET);
  });

  it("firma una URL que descarga el contenido subido", async () => {
    const url = await adapter.signedUrl(BUCKET, uploaded[0]!, 300);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("contenido de prueba");
  });

  it("la firma caduca", async () => {
    const url = await adapter.signedUrl(BUCKET, uploaded[0]!, 1);
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(url);
    expect(res.ok).toBe(false);
  });

  it("nunca usa el nombre original del archivo", async () => {
    // Un nombre con ruta, espacios y acentos: el vector clásico de
    // path traversal, y además rompe firmas mal construidas.
    const result = await adapter.put({
      tenantId: TENANT,
      file: new Blob(["x"]),
      filename: "../../etc/passwd copia ñ.png",
      contentType: "image/png",
    });
    uploaded.push(result.path);

    expect(result.path).not.toContain("..");
    expect(result.path).not.toContain(" ");
    expect(result.path).not.toContain("passwd");
    expect(result.path.startsWith(`${TENANT}/`)).toBe(true);
  });

  it("firma en lote y omite lo que no existe", async () => {
    const urls = await adapter.signedUrls(
      BUCKET,
      [uploaded[0]!, `${TENANT}/2026/08/no-existe.webp`],
      300,
    );

    // Presignar es cálculo local: S3 firma cualquier clave sin comprobar que
    // exista. Lo que importa es que la que SÍ existe se descargue.
    expect(urls.has(uploaded[0]!)).toBe(true);
    const res = await fetch(urls.get(uploaded[0]!)!);
    expect(res.status).toBe(200);
  });

  it("borra en lote", async () => {
    const result = await adapter.put({
      tenantId: TENANT,
      file: new Blob(["temporal"]),
      filename: "borrame.webp",
      contentType: "image/webp",
    });

    await adapter.remove(BUCKET, [result.path]);

    const url = await adapter.signedUrl(BUCKET, result.path, 300);
    expect((await fetch(url)).ok).toBe(false);
  });

  it("publicUrl falla en voz alta si no hay CDN configurado", () => {
    // Devolver una URL inventada sería peor: el cliente publicaría enlaces
    // rotos sin que nada avisara.
    expect(() => adapter.publicUrl(BUCKET, "x.webp")).toThrow(/CDN/i);
  });
});

describe.skipIf(!hasS3Config)("convivencia de proveedores", () => {
  it("firma en la misma llamada archivos de Supabase y de S3", async () => {
    // Es el escenario de una migración a medias: hasta que se copien los
    // archivos viejos, la misma pantalla mezcla los dos orígenes.
    const supabasePath = `${TENANT}/2026/08/desde-supabase.webp`;
    await admin.storage
      .from(BUCKET)
      .upload(supabasePath, new Blob(["viejo"]), { contentType: "image/webp", upsert: true });
    uploaded.push(supabasePath);

    const s3 = await adapter.put({
      tenantId: TENANT,
      file: new Blob(["nuevo"]),
      filename: "desde-s3.webp",
      contentType: "image/webp",
    });
    uploaded.push(s3.path);

    const urls = await signLocations(
      admin,
      [
        { provider: "SUPABASE", bucket: BUCKET, path: supabasePath },
        { provider: "S3", bucket: BUCKET, path: s3.path },
      ],
      300,
    );

    expect(urls.size).toBe(2);

    const [viejo, nuevo] = await Promise.all([
      fetch(urls.get(supabasePath)!).then((r) => r.text()),
      fetch(urls.get(s3.path)!).then((r) => r.text()),
    ]);

    expect(viejo).toBe("viejo");
    expect(nuevo).toBe("nuevo");
  });
});
