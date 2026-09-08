import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * El endpoint GraphQL.
 *
 * Lo que se comprueba aquí no es que GraphQL funcione —eso lo garantiza la
 * librería— sino que es **la misma API** que REST: mismo aislamiento, mismos
 * permisos, mismos datos, mismo cupo. Un envoltorio que se desvía en
 * cualquiera de esas cuatro cosas es una segunda puerta con otra cerradura.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

type Fixture = { tenantId: string; apiKey: string; mediaKey: string; mediaId: string };

const created: string[] = [];

async function makeTenant(name: string): Promise<Fixture> {
  const suffix = `gql-${name}-${Date.now()}`;

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

  const path = `${tenant!.id}/2026/08/portada.webp`;
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

  // Dos claves: una con el permiso por defecto —sólo contenido— y otra que
  // además puede leer la biblioteca. La diferencia entre ambas es justo lo que
  // GraphQL tiene que seguir respetando campo a campo.
  const [{ data: contentKey }, { data: mediaKey }] = await Promise.all([
    admin.rpc("create_api_key", { p_tenant: tenant!.id, p_name: "gql-contenido" }),
    admin.rpc("create_api_key", {
      p_tenant: tenant!.id,
      p_name: "gql-medios",
      p_scopes: ["content:read", "media:read"],
    }),
  ]);

  return {
    tenantId: tenant!.id,
    apiKey: (contentKey as { plain_key: string }[])[0].plain_key,
    mediaKey: (mediaKey as { plain_key: string }[])[0].plain_key,
    mediaId: media!.id,
  };
}

let a: Fixture;
let b: Fixture;

type GraphQLBody = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function gql(
  query: string,
  key?: string,
  variables?: Record<string, unknown>,
): Promise<{ status: number; body: GraphQLBody; headers: Headers }> {
  const res = await fetch(`${API}/api/v1/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  return { status: res.status, body: (await res.json()) as GraphQLBody, headers: res.headers };
}

const rest = (path: string, key: string) =>
  fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });

beforeAll(async () => {
  [a, b] = await Promise.all([makeTenant("alpha"), makeTenant("beta")]);
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created);
});

// ---------------------------------------------------------------------------

describe("credenciales", () => {
  it("sin clave responde 401, no un error de GraphQL", async () => {
    // Importa el status: un 200 con `errors` obligaría a cada cliente a mirar
    // dentro del cuerpo para saber que ni siquiera se ha autenticado.
    const { status, body } = await gql(`{ posts { nodes { id } } }`);

    expect(status).toBe(401);
    expect((body as unknown as { error: { code: string } }).error.code).toBe("unauthorized");
  });

  it("una clave inventada tampoco ejecuta nada", async () => {
    const { status } = await gql(`{ posts { nodes { id } } }`, "kntr_live_falsa.inventada");
    expect(status).toBe(401);
  });
});

describe("aislamiento entre clientes", () => {
  it("el mismo slug devuelve el contenido de cada tenant", async () => {
    const query = `{ post(slug: "articulo-compartido") { title customFields } }`;

    const [ra, rb] = await Promise.all([gql(query, a.apiKey), gql(query, b.apiKey)]);

    expect((ra.body.data!.post as { title: string }).title).toBe("Publicado de alpha");
    expect((rb.body.data!.post as { title: string }).title).toBe("Publicado de beta");
  });

  it("no hay forma de pedir el contenido de otro cliente", async () => {
    // El tenant sale de la clave y no se acepta como argumento: no existe un
    // parámetro que manipular.
    const { body } = await gql(`{ posts { nodes { title } } }`, a.apiKey);
    const titles = (body.data!.posts as { nodes: { title: string }[] }).nodes.map((n) => n.title);

    expect(titles).toContain("Publicado de alpha");
    expect(titles).not.toContain("Publicado de beta");
  });

  it("el id de un archivo ajeno no lo entrega", async () => {
    const { body } = await gql(`{ mediaAsset(id: "${b.mediaId}") { url } }`, a.mediaKey);
    expect(body.data!.mediaAsset).toBeNull();
  });
});

describe("permisos, campo a campo", () => {
  it("una clave sin media:read no puede leer la biblioteca", async () => {
    const { body } = await gql(`{ media { nodes { id } } }`, a.apiKey);

    expect(body.errors?.[0].extensions?.code).toBe("forbidden");
    expect(body.errors?.[0].message).toContain("media:read");
  });

  /**
   * Lo que distingue a GraphQL de REST: una sola petición toca dos permisos
   * distintos. El contenido debe llegar aunque los medios se denieguen — si
   * un permiso que falta tumbase la respuesta entera, agrupar consultas sería
   * un castigo.
   */
  it("deniega sólo el campo sin permiso y sirve el resto", async () => {
    const { body } = await gql(
      `{ posts { nodes { title } } media { nodes { id } } }`,
      a.apiKey,
    );

    expect(body.errors?.[0].extensions?.code).toBe("forbidden");
    expect((body.data!.posts as { nodes: unknown[] }).nodes).toHaveLength(1);
    expect(body.data!.media).toBeNull();
  });

  it("con media:read sí la lee", async () => {
    const { body } = await gql(`{ media { nodes { id url mimeType } } }`, a.mediaKey);

    expect(body.errors).toBeUndefined();
    const nodes = (body.data!.media as { nodes: { url: string }[] }).nodes;
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0].url).toMatch(/^https?:\/\//);
  });
});

describe("paridad con REST", () => {
  it("entrega el mismo contenido que el endpoint equivalente", async () => {
    const [viaRest, viaGql] = await Promise.all([
      rest("/api/v1/posts/articulo-compartido", a.apiKey).then((r) => r.json()),
      gql(
        `{ post(slug: "articulo-compartido") {
             id slug title excerpt locale readingTime
             customFields
             category { slug name kind }
             tags { slug }
             content { html }
           } }`,
        a.apiKey,
      ),
    ]);

    const post = viaGql.body.data!.post as Record<string, unknown>;

    expect(post.id).toBe(viaRest.data.id);
    expect(post.title).toBe(viaRest.data.title);
    expect(post.excerpt).toBe(viaRest.data.excerpt);
    expect(post.locale).toBe(viaRest.data.locale);
    expect((post.category as { slug: string }).slug).toBe(viaRest.data.category.slug);
    expect((post.content as { html: string }).html).toBe(viaRest.data.content.html);
  });

  it("la portada llega firmada y se puede descargar", async () => {
    const { body } = await gql(
      `{ posts { nodes { cover { url width height alt } } } }`,
      a.apiKey,
    );

    const cover = (body.data!.posts as { nodes: { cover: { url: string; width: number } }[] })
      .nodes[0].cover;

    expect(cover.url).toMatch(/^https?:\/\//);
    expect(cover.width).toBe(800);

    const download = await fetch(cover.url);
    expect(download.status).toBe(200);
  });

  it("cuenta las entradas publicadas de cada categoría, igual que REST", async () => {
    const [viaRest, viaGql] = await Promise.all([
      rest("/api/v1/categories", a.apiKey).then((r) => r.json()),
      gql(`{ categories { slug postCount } }`, a.apiKey),
    ]);

    const gqlBlog = (body: unknown) =>
      (body as { slug: string; postCount: number }[]).find((c) => c.slug === "blog")!;

    expect(gqlBlog(viaGql.body.data!.categories).postCount).toBe(
      gqlBlog(viaRest.data).postCount,
    );
  });
});

describe("el cuerpo se paga aparte", () => {
  it("el listado no lo trae aunque se pida", async () => {
    // `listPosts` no carga el cuerpo a propósito: resolverlo por entrada
    // convertiría una portada de 100 elementos en 100 lecturas de HTML.
    const { body } = await gql(`{ posts { nodes { title content { html } } } }`, a.apiKey);

    const node = (body.data!.posts as { nodes: { content: unknown }[] }).nodes[0];
    expect(node.content).toBeNull();
  });

  it("el detalle sí", async () => {
    const { body } = await gql(
      `{ post(slug: "articulo-compartido") { content { html json } } }`,
      a.apiKey,
    );

    const content = (body.data!.post as { content: { html: string; json: { type: string } } })
      .content;

    expect(content.html).toContain("<p>");
    expect(content.json.type).toBe("doc");
  });
});

describe("ausencias y errores", () => {
  it("un slug inexistente es null, no un error", async () => {
    // En GraphQL "no existe" es un valor legítimo: el tipo ya es anulable y el
    // cliente lo distingue sin mirar la lista de errores.
    const { body } = await gql(`{ post(slug: "no-existe-jamas") { title } }`, a.apiKey);

    expect(body.data!.post).toBeNull();
    expect(body.errors).toBeUndefined();
  });

  it("un borrador se comporta igual que un slug inexistente", async () => {
    const { body } = await gql(`{ post(slug: "solo-borrador") { title } }`, a.apiKey);
    expect(body.data!.post).toBeNull();
  });

  it("un idioma no activado es un error con código, no una lista vacía", async () => {
    const { body } = await gql(`{ posts(locale: "sv") { nodes { id } } }`, a.apiKey);

    expect(body.errors?.[0].extensions?.code).toBe("bad_request");
    expect(body.errors?.[0].message).toContain("sv");
  });

  it("no filtra detalles internos de la base", async () => {
    // Un id malformado llega a la capa de consultas y vuelve como bad_request;
    // lo que nunca debe viajar es un mensaje de Postgres con nombres de tablas
    // o constraints, que es el mapa del esquema servido al atacante.
    const { body } = await gql(`{ mediaAsset(id: "no-es-un-uuid") { url } }`, a.mediaKey);

    expect(body.errors?.[0].extensions?.code).toBe("bad_request");
    expect(body.errors?.[0].message).not.toMatch(/postgres|relation|column|syntax/i);
  });
});

describe("cupo", () => {
  it("informa de lo que ha costado y de lo que queda", async () => {
    const { headers } = await gql(`{ posts { nodes { id } } }`, a.apiKey);

    expect(headers.get("x-graphql-cost")).toBe("1");
    expect(Number(headers.get("x-ratelimit-remaining"))).toBeGreaterThanOrEqual(0);
    expect(Number(headers.get("x-ratelimit-limit"))).toBeGreaterThan(0);
  });

  it("una consulta con tres lecturas cuesta tres", async () => {
    const { headers } = await gql(
      `{ posts { nodes { id } } categories { id } uno: posts { nodes { id } } }`,
      a.apiKey,
    );

    expect(headers.get("x-graphql-cost")).toBe("3");
  });

  /**
   * La propiedad que justifica todo el modelo de coste: pedir una página
   * grande por GraphQL cuesta lo mismo que pedirla por REST.
   */
  it("el tamaño de página no encarece la consulta", async () => {
    const { headers } = await gql(`{ posts(limit: 100) { nodes { id } } }`, a.apiKey);
    expect(headers.get("x-graphql-cost")).toBe("1");
  });

  it("rechaza el anidamiento excesivo sin ejecutarlo", async () => {
    const profunda = `{ a { b { c { d { e { f { g { h { i { j } } } } } } } } } }`;
    const { status, body } = await gql(profunda, a.apiKey);

    expect(status).toBe(400);
    expect((body as unknown as { error: { code: string } }).error.code).toBe("bad_request");
  });
});

describe("transporte", () => {
  it("no acepta consultas por GET", async () => {
    // Una consulta por GET acaba en los logs de acceso y en el historial del
    // navegador, y la cabecera lleva una clave que abre todo el contenido.
    const res = await fetch(`${API}/api/v1/graphql?query={posts{nodes{id}}}`, {
      headers: { Authorization: `Bearer ${a.apiKey}` },
    });

    expect(res.status).toBe(400);
  });

  it("responde al preflight de CORS con POST permitido", async () => {
    const res = await fetch(`${API}/api/v1/graphql`, { method: "OPTIONS" });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
