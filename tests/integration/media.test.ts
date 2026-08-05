import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Endpoints de media y caducidad de las URLs firmadas.
 *
 * El test que de verdad importa es el del refirmado: un `src` caducado dentro
 * del contenido rompe todas las imágenes de la web del cliente y **no produce
 * ningún error en el CMS**. Sin cobertura, la regresión sólo se descubre
 * cuando el cliente llama, una semana después de publicar.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
const created: string[] = [];

type Fixture = {
  tenantId: string;
  fullKey: string;
  contentOnlyKey: string;
  mediaId: string;
  staleUrl: string;
};

async function makeFixture(name: string): Promise<Fixture> {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({ slug: `media-${name}-${Date.now()}`, name, status: "ACTIVE", plan: "PRO" })
    .select("id")
    .single();
  created.push(tenant!.id);

  const path = `${tenant!.id}/2026/08/imagen.webp`;
  await admin.storage
    .from("tenant-media")
    .upload(path, new Blob(["contenido"]), { contentType: "image/webp", upsert: true });

  const { data: media } = await admin
    .from("media")
    .insert({
      tenant_id: tenant!.id,
      bucket: "tenant-media",
      path,
      mime_type: "image/webp",
      size_bytes: 9,
      width: 800,
      height: 600,
      alt_text: "Imagen",
    })
    .select("id")
    .single();

  // Un segundo de validez: al llegar las aserciones ya está caducada, igual
  // que estaría el contenido publicado hace más de una semana.
  const { data: signed } = await admin.storage
    .from("tenant-media")
    .createSignedUrl(path, 1);
  const staleUrl = signed!.signedUrl;

  await admin.from("posts").insert({
    tenant_id: tenant!.id,
    slug: "con-imagen",
    title: "Con imagen",
    status: "PUBLISHED",
    published_at: new Date().toISOString(),
    content_html: `<p>Texto</p><img class="kntr-image" data-media-id="${media!.id}" src="${staleUrl}" alt="Imagen">`,
    content_json: {
      type: "doc",
      content: [
        { type: "image", attrs: { src: staleUrl, mediaId: media!.id, alt: "Imagen" } },
      ],
    },
  });

  const keys = await Promise.all([
    admin.rpc("create_api_key", {
      p_tenant: tenant!.id,
      p_name: "full",
      p_scopes: ["content:read", "media:read"],
    }),
    admin.rpc("create_api_key", {
      p_tenant: tenant!.id,
      p_name: "solo-contenido",
      p_scopes: ["content:read"],
    }),
  ]);

  return {
    tenantId: tenant!.id,
    fullKey: (keys[0].data as { plain_key: string }[])[0].plain_key,
    contentOnlyKey: (keys[1].data as { plain_key: string }[])[0].plain_key,
    mediaId: media!.id,
    staleUrl,
  };
}

let a: Fixture;
let b: Fixture;

const get = (path: string, key?: string) =>
  fetch(`${API}${path}`, key ? { headers: { Authorization: `Bearer ${key}` } } : undefined);

beforeAll(async () => {
  [a, b] = await Promise.all([makeFixture("alpha"), makeFixture("beta")]);
  // Margen para que caduque la firma de un segundo.
  await new Promise((r) => setTimeout(r, 2000));
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created);
});

describe("imágenes incrustadas en el contenido", () => {
  it("la URL guardada en la base está caducada", async () => {
    // Contraprueba: si esto devolviera 200, el test de abajo no probaría nada.
    const stale = await fetch(a.staleUrl);
    expect(stale.ok).toBe(false);
  });

  it("la API sirve el contenido con las imágenes vueltas a firmar", async () => {
    const res = await get("/api/v1/posts/con-imagen", a.fullKey);
    const { data } = await res.json();

    const src = /src="([^"]+)"/.exec(data.content.html)?.[1];
    expect(src).toBeDefined();
    expect(src).not.toBe(a.staleUrl);

    const download = await fetch(src!);
    expect(download.status).toBe(200);
  });

  it("también refirma dentro de content.json", async () => {
    const res = await get("/api/v1/posts/con-imagen", a.fullKey);
    const { data } = await res.json();

    const image = data.content.json.content.find(
      (n: { type: string }) => n.type === "image",
    );
    expect(image.attrs.src).not.toBe(a.staleUrl);
    expect(image.attrs.mediaId).toBe(a.mediaId);
  });

  it("no firma archivos de otro tenant aunque se inyecte su id", async () => {
    // `data-media-id` es texto del documento: alguien puede escribir a mano
    // el id de otro cliente para que se lo firmemos.
    await admin
      .from("posts")
      .update({
        content_html: `<img data-media-id="${b.mediaId}" src="/robado.webp">`,
        content_json: { type: "doc", content: [] },
      })
      .eq("tenant_id", a.tenantId)
      .eq("slug", "con-imagen");

    const res = await get("/api/v1/posts/con-imagen", a.fullKey);
    const { data } = await res.json();

    expect(data.content.html).toContain('src="/robado.webp"');
    expect(data.content.html).not.toContain("token=");
  });
});

describe("GET /api/v1/media", () => {
  it("lista los archivos con URL utilizable", async () => {
    const res = await get("/api/v1/media", a.fullKey);
    const { data } = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].url).toMatch(/^https?:\/\//);
    expect(data[0].width).toBe(800);
    expect(data[0]).not.toHaveProperty("path");

    const download = await fetch(data[0].url);
    expect(download.status).toBe(200);
  });

  it("filtra por tipo y rechaza los inválidos", async () => {
    const videos = await get("/api/v1/media?type=video", a.fullKey);
    expect((await videos.json()).data).toHaveLength(0);

    const bad = await get("/api/v1/media?type=inventado", a.fullKey);
    expect(bad.status).toBe(400);
  });

  it("no devuelve archivos de otro tenant", async () => {
    const res = await get("/api/v1/media", a.fullKey);
    const ids = (await res.json()).data.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(b.mediaId);
  });
});

describe("GET /api/v1/media/[id]", () => {
  it("devuelve el archivo con una firma fresca", async () => {
    const res = await get(`/api/v1/media/${a.mediaId}`, a.fullKey);
    const { data } = await res.json();

    expect(data.id).toBe(a.mediaId);
    expect(data.expiresIn).toBeGreaterThan(0);
    expect((await fetch(data.url)).status).toBe(200);
  });

  it("da 404 con el id de otro tenant, no su archivo", async () => {
    const res = await get(`/api/v1/media/${b.mediaId}`, a.fullKey);
    expect(res.status).toBe(404);
  });

  it("distingue un id malformado de uno inexistente", async () => {
    const malformed = await get("/api/v1/media/no-es-un-uuid", a.fullKey);
    const missing = await get(
      "/api/v1/media/00000000-0000-0000-0000-000000000000",
      a.fullKey,
    );

    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("permiso media:read", () => {
  it("una clave de sólo contenido no accede a la biblioteca", async () => {
    for (const path of ["/api/v1/media", `/api/v1/media/${a.mediaId}`]) {
      const res = await get(path, a.contentOnlyKey);
      expect(res.status, path).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    }
  });

  it("pero sí lee contenido", async () => {
    const res = await get("/api/v1/posts", a.contentOnlyKey);
    expect(res.status).toBe(200);
  });
});
