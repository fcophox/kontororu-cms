import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Respaldo de idioma de la API pública.
 *
 * Lo que se comprueba aquí es lo que ve la web del cliente cuando un contenido
 * no está traducido: antes recibía un hueco en el listado y un 404 en el
 * detalle, y la sección inglesa se quedaba a medias sin que nada fallara.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

let tenantId: string;
let apiKey: string;

const get = (path: string) =>
  fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });

const gql = async (query: string) => {
  const res = await fetch(`${API}/api/v1/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
};

beforeAll(async () => {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({
      slug: `fallback-${Date.now()}`,
      name: "Fallback",
      status: "ACTIVE",
      default_locale: "es",
      locales: ["es", "en"],
    })
    .select("id")
    .single();

  tenantId = tenant!.id;

  const { data: blog } = await admin
    .from("categories")
    .insert({ tenant_id: tenantId, slug: "blog", name: "Blog", kind: "BLOG" })
    .select("id")
    .single();

  const publishedAt = new Date(Date.now() - 60_000).toISOString();

  // Sólo en español: es el caso que antes desaparecía al pedir inglés.
  await admin.from("posts").insert({
    tenant_id: tenantId,
    category_id: blog!.id,
    slug: "sin-traducir",
    locale: "es",
    title: "Sin traducir",
    content_html: "<p>Cuerpo</p>",
    content_json: { type: "doc", content: [] },
    status: "PUBLISHED",
    published_at: publishedAt,
  });

  // Traducido: no debe llegar duplicado ni contarse dos veces.
  const group = crypto.randomUUID();
  await admin.from("posts").insert([
    {
      tenant_id: tenantId,
      category_id: blog!.id,
      slug: "traducido",
      locale: "es",
      translation_group_id: group,
      title: "Traducido",
      content_html: "<p>Cuerpo</p>",
      content_json: { type: "doc", content: [] },
      status: "PUBLISHED",
      published_at: publishedAt,
    },
    {
      tenant_id: tenantId,
      category_id: blog!.id,
      slug: "traducido",
      locale: "en",
      translation_group_id: group,
      title: "Translated",
      content_html: "<p>Body</p>",
      content_json: { type: "doc", content: [] },
      status: "PUBLISHED",
      published_at: publishedAt,
    },
  ]);

  const { data: key } = await admin.rpc("create_api_key", {
    p_tenant: tenantId,
    p_name: "test",
  });
  apiKey = (key as { plain_key: string }[])[0].plain_key;
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().eq("id", tenantId);
});

describe("respaldo al idioma principal", () => {
  it("el listado en inglés incluye lo que sólo existe en español", async () => {
    const res = await get("/api/v1/posts?locale=en");
    const body = await res.json();

    const slugs = body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("sin-traducir");

    const suplente = body.data.find((p: { slug: string }) => p.slug === "sin-traducir");
    // Viene marcado con su idioma real para que el front pueda avisarlo.
    expect(suplente.locale).toBe("es");
  });

  it("un contenido traducido viaja una sola vez y en el idioma pedido", async () => {
    const res = await get("/api/v1/posts?locale=en");
    const body = await res.json();

    const traducidos = body.data.filter((p: { slug: string }) => p.slug === "traducido");
    expect(traducidos).toHaveLength(1);
    expect(traducidos[0].locale).toBe("en");
    expect(traducidos[0].title).toBe("Translated");
  });

  it("el detalle en inglés sirve la versión española cuando no hay otra", async () => {
    const res = await get("/api/v1/posts/sin-traducir?locale=en");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.locale).toBe("es");
    expect(body.data.title).toBe("Sin traducir");
  });

  it("?fallback=none conserva el comportamiento estricto", async () => {
    const lista = await (await get("/api/v1/posts?locale=en&fallback=none")).json();
    expect(lista.data.map((p: { slug: string }) => p.slug)).not.toContain("sin-traducir");

    const detalle = await get("/api/v1/posts/sin-traducir?locale=en&fallback=none");
    expect(detalle.status).toBe(404);
  });

  it("el conteo de categorías cuenta contenidos, no filas", async () => {
    const body = await (await get("/api/v1/categories?locale=en")).json();
    const blog = body.data.find((c: { slug: string }) => c.slug === "blog");
    // Dos contenidos: el traducido y el que va de respaldo.
    expect(blog.postCount).toBe(2);
  });
});

/**
 * Paridad entre transportes.
 *
 * GraphQL se anunció como envoltorio de la API que ya existe, así que una web
 * no puede ver contenido distinto según por dónde pregunte. Estas pruebas
 * existen porque eso ya se rompió una vez: al reintegrar GraphQL, `fallback`
 * quedó con `false` por defecto mientras REST respaldaba salvo `?fallback=none`,
 * y el contenido sin traducir desaparecía sólo por GraphQL. Ningún test lo
 * detectó — todos comprobaban REST.
 */
describe("el respaldo se comporta igual por REST y por GraphQL", () => {
  it("el listado por defecto incluye lo que sólo existe en español", async () => {
    const body = await gql(`{ posts(locale: "en") { nodes { slug locale } } }`);
    expect(body.errors).toBeUndefined();

    const nodes = body.data.posts.nodes as { slug: string; locale: string }[];
    const suplente = nodes.find((p) => p.slug === "sin-traducir");
    expect(suplente).toBeDefined();
    expect(suplente!.locale).toBe("es");
  });

  it("devuelve exactamente los mismos slugs que REST", async () => {
    const rest = await (await get("/api/v1/posts?locale=en")).json();
    const body = await gql(`{ posts(locale: "en") { nodes { slug } } }`);

    const porRest = rest.data.map((p: { slug: string }) => p.slug).sort();
    const porGql = body.data.posts.nodes.map((p: { slug: string }) => p.slug).sort();
    expect(porGql).toEqual(porRest);
  });

  it("fallback: false equivale a ?fallback=none", async () => {
    const body = await gql(`{ posts(locale: "en", fallback: false) { nodes { slug } } }`);
    const slugs = body.data.posts.nodes.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain("sin-traducir");
  });

  it("el detalle sirve la versión española cuando no hay traducción", async () => {
    const body = await gql(`{ post(slug: "sin-traducir", locale: "en") { locale title } }`);
    expect(body.data.post).not.toBeNull();
    expect(body.data.post.locale).toBe("es");
  });

  it("el conteo de categorías coincide con el de REST", async () => {
    const rest = await (await get("/api/v1/categories?locale=en")).json();
    const body = await gql(`{ categories(locale: "en") { slug postCount } }`);

    const porRest = rest.data.find((c: { slug: string }) => c.slug === "blog").postCount;
    const porGql = body.data.categories.find((c: { slug: string }) => c.slug === "blog").postCount;
    expect(porGql).toBe(porRest);
  });
});
