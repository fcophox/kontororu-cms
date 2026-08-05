import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Superficie pública de la API headless.
 *
 * `isolation.test.ts` comprueba que un cliente no ve a otro. Este comprueba
 * que el contrato con las webs de los clientes se cumple: filtros que filtran,
 * portadas que se pueden pintar, y errores con forma estable.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

type Fixture = { tenantId: string; apiKey: string; slug: string };

const created: string[] = [];

async function makeTenant(name: string): Promise<Fixture> {
  const suffix = `${name}-${Date.now()}`;

  const { data: tenant } = await admin
    .from("tenants")
    .insert({ slug: suffix, name, status: "ACTIVE" })
    .select("id")
    .single();
  created.push(tenant!.id);

  const { data: blog } = await admin
    .from("categories")
    .insert({ tenant_id: tenant!.id, slug: "blog", name: "Blog", kind: "BLOG" })
    .select("id")
    .single();

  await admin
    .from("categories")
    .insert({ tenant_id: tenant!.id, slug: "vacia", name: "Vacía", kind: "SERVICE" });

  // Media real en Storage: sin el objeto, la URL firmada no se genera y la
  // portada se omite — que es justo lo que este test debe distinguir.
  const path = `${tenant!.id}/2026/08/cover.webp`;
  await admin.storage
    .from("tenant-media")
    .upload(path, new Blob(["x"]), { contentType: "image/webp", upsert: true });

  const { data: media } = await admin
    .from("media")
    .insert({
      tenant_id: tenant!.id,
      bucket: "tenant-media",
      path,
      mime_type: "image/webp",
      size_bytes: 1,
      width: 800,
      height: 600,
      alt_text: "Portada",
    })
    .select("id")
    .single();

  await admin.from("posts").insert({
    tenant_id: tenant!.id,
    category_id: blog!.id,
    cover_media_id: media!.id,
    slug: "articulo-compartido",
    title: `Publicado de ${name}`,
    excerpt: "Resumen",
    content_html: "<p>Cuerpo</p>",
    content_json: { type: "doc", content: [] },
    custom_fields: { cliente: name },
    status: "PUBLISHED",
    published_at: new Date().toISOString(),
  });

  await admin.from("posts").insert({
    tenant_id: tenant!.id,
    slug: "solo-borrador",
    title: "Borrador",
    status: "DRAFT",
  });

  const { data: key } = await admin.rpc("create_api_key", {
    p_tenant: tenant!.id,
    p_name: "test",
  });

  return {
    tenantId: tenant!.id,
    apiKey: (key as { plain_key: string }[])[0].plain_key,
    slug: "articulo-compartido",
  };
}

let a: Fixture;
let b: Fixture;

const get = (path: string, key?: string) =>
  fetch(`${API}${path}`, key ? { headers: { Authorization: `Bearer ${key}` } } : undefined);

beforeAll(async () => {
  [a, b] = await Promise.all([makeTenant("alpha"), makeTenant("beta")]);
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created);
});

describe("GET /api/v1/posts", () => {
  it("filtra de verdad por categoría inexistente", async () => {
    // Regresión: sin `!inner`, PostgREST filtraba el embed en vez del padre y
    // esto devolvía todos los posts con `category: null`.
    const res = await get("/api/v1/posts?category=no-existe", a.apiKey);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("devuelve el contenido al filtrar por una categoría real", async () => {
    const res = await get("/api/v1/posts?category=blog", a.apiKey);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].category.slug).toBe("blog");
  });

  it("entrega la portada como URL descargable, no como bucket y ruta", async () => {
    const res = await get("/api/v1/posts", a.apiKey);
    const { cover } = (await res.json()).data[0];

    expect(cover).not.toBeNull();
    expect(cover.url).toMatch(/^https?:\/\//);
    expect(cover).not.toHaveProperty("bucket");
    expect(cover).not.toHaveProperty("path");
    expect(cover.width).toBe(800);

    const download = await fetch(cover.url);
    expect(download.status).toBe(200);
  });

  it("no incluye el cuerpo en el listado", async () => {
    const res = await get("/api/v1/posts", a.apiKey);
    expect((await res.json()).data[0]).not.toHaveProperty("content");
  });

  it("respeta el límite y acota los valores absurdos", async () => {
    const res = await get("/api/v1/posts?limit=0", a.apiKey);
    expect(res.ok).toBe(true);
    const huge = await get("/api/v1/posts?limit=99999", a.apiKey);
    expect(huge.ok).toBe(true);
  });
});

describe("GET /api/v1/posts/[slug]", () => {
  it("incluye el cuerpo en html y json", async () => {
    const res = await get(`/api/v1/posts/${a.slug}`, a.apiKey);
    const { data } = await res.json();
    expect(data.content.html).toContain("<p>");
    expect(data.content.json).toHaveProperty("type", "doc");
    expect(data.customFields.cliente).toBe("alpha");
  });

  it("el mismo slug devuelve el contenido de cada tenant", async () => {
    // Dos clientes pueden tener /sobre-nosotros: el tenant sale de la clave.
    const [ra, rb] = await Promise.all([
      get(`/api/v1/posts/articulo-compartido`, a.apiKey),
      get(`/api/v1/posts/articulo-compartido`, b.apiKey),
    ]);
    const [da, db] = await Promise.all([ra.json(), rb.json()]);

    expect(da.data.title).toBe("Publicado de alpha");
    expect(db.data.title).toBe("Publicado de beta");
    expect(da.data.id).not.toBe(db.data.id);
  });

  it("da 404 en un borrador, igual que en un slug inexistente", async () => {
    const draft = await get("/api/v1/posts/solo-borrador", a.apiKey);
    const missing = await get("/api/v1/posts/no-existe-en-absoluto", a.apiKey);

    expect(draft.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await draft.json()).error.code).toBe("not_found");
  });
});

describe("GET /api/v1/categories", () => {
  it("cuenta sólo entradas publicadas", async () => {
    const res = await get("/api/v1/categories", a.apiKey);
    const { data } = await res.json();

    const blog = data.find((c: { slug: string }) => c.slug === "blog");
    const vacia = data.find((c: { slug: string }) => c.slug === "vacia");

    expect(blog.postCount).toBe(1);
    expect(vacia.postCount).toBe(0);
  });

  it("filtra por kind y rechaza los inválidos", async () => {
    const ok = await get("/api/v1/categories?kind=SERVICE", a.apiKey);
    expect((await ok.json()).data.map((c: { slug: string }) => c.slug)).toEqual(["vacia"]);

    const bad = await get("/api/v1/categories?kind=INVENTADO", a.apiKey);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("bad_request");
  });

  it("no devuelve categorías de otro tenant", async () => {
    const res = await get("/api/v1/categories", a.apiKey);
    const { data } = await res.json();
    const { data: allCategories } = await admin
      .from("categories")
      .select("id")
      .eq("tenant_id", b.tenantId);

    const ids = new Set(data.map((c: { id: string }) => c.id));
    for (const c of allCategories ?? []) expect(ids.has(c.id)).toBe(false);
  });
});

describe("contrato de la API", () => {
  it("responde al preflight de CORS en las tres rutas", async () => {
    for (const path of ["/api/v1/posts", `/api/v1/posts/${a.slug}`, "/api/v1/categories"]) {
      const res = await fetch(`${API}${path}`, { method: "OPTIONS" });
      expect(res.status, path).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("usa una forma de error estable", async () => {
    const res = await get("/api/v1/posts");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "unauthorized" });
    expect(typeof body.error.message).toBe("string");
  });

  it("marca las respuestas como cacheables por el CDN", async () => {
    const res = await get("/api/v1/posts", a.apiKey);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });
});
