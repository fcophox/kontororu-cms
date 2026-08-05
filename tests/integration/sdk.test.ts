import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { KontororuClient, KontororuError } from "@sdk/index";
import { verifyWebhook, affectedTags, WebhookVerificationError } from "@sdk/webhooks";

/**
 * SDK contra la API real.
 *
 * Se prueba contra el servidor y no con `fetch` simulado porque lo que puede
 * romperse es justamente el acuerdo entre ambos: un campo renombrado en la
 * respuesta o un código de error distinto pasan desapercibidos en un test con
 * mocks y revientan la web de un cliente.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createSupabase(URL_BASE, SERVICE, { auth: { persistSession: false } });
const created: string[] = [];

let client: KontororuClient;
let tenantId: string;

beforeAll(async () => {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({
      slug: `sdk-${Date.now()}`,
      name: "SDK",
      status: "ACTIVE",
      plan: "PRO",
      locales: ["es", "en"],
      default_locale: "es",
    })
    .select("id")
    .single();
  created.push(tenant!.id);
  tenantId = tenant!.id;

  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: tenantId, slug: "blog", name: "Blog", kind: "BLOG", locale: "es" })
    .select("id, translation_group_id")
    .single();

  const { data: post } = await admin
    .from("posts")
    .insert({
      tenant_id: tenantId,
      category_id: category!.id,
      slug: "hola-mundo",
      title: "Hola mundo",
      excerpt: "Resumen",
      content_html: "<p>Cuerpo</p>",
      content_json: { type: "doc", content: [] },
      custom_fields: { cliente: "ACME" },
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      locale: "es",
    })
    .select("translation_group_id")
    .single();

  await admin.from("posts").insert({
    tenant_id: tenantId,
    translation_group_id: post!.translation_group_id,
    slug: "hello-world",
    title: "Hello world",
    status: "PUBLISHED",
    published_at: new Date().toISOString(),
    content_html: "<p>Body</p>",
    content_json: { type: "doc", content: [] },
    locale: "en",
  });

  // Un puñado más, para ejercitar la paginación de verdad.
  for (let i = 0; i < 5; i++) {
    await admin.from("posts").insert({
      tenant_id: tenantId,
      slug: `relleno-${i}`,
      title: `Relleno ${i}`,
      status: "PUBLISHED",
      published_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
      content_html: "<p>x</p>",
      content_json: { type: "doc", content: [] },
      locale: "es",
    });
  }

  const { data: key } = await admin.rpc("create_api_key", {
    p_tenant: tenantId,
    p_name: "sdk",
    p_scopes: ["content:read", "media:read"],
  });

  client = new KontororuClient({
    url: API,
    apiKey: (key as { plain_key: string }[])[0].plain_key,
  });
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created);
});

describe("configuración", () => {
  it("acepta la URL con y sin /api/v1", async () => {
    // Copiar la URL del panel no debería obligar a recordar el sufijo.
    const conSufijo = new KontororuClient({
      url: `${API}/api/v1`,
      apiKey: (client as unknown as { apiKey: string }).apiKey,
    });
    const page = await conSufijo.listPosts({ limit: 1 });
    expect(page.data).toHaveLength(1);
  });

  it("falla al construirse si falta la clave", () => {
    expect(() => new KontororuClient({ url: API, apiKey: "" })).toThrow(/API Key/i);
  });
});

describe("contenido", () => {
  it("lista con la forma tipada del contrato", async () => {
    const page = await client.listPosts({ limit: 2 });

    expect(page.data).toHaveLength(2);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.nextCursor).toBeTruthy();

    const post = page.data[0]!;
    expect(post).toHaveProperty("slug");
    expect(post).toHaveProperty("locale");
    expect(post).toHaveProperty("translations");
    // El listado no trae cuerpo: si lo trajera, el tipo mentiría.
    expect(post).not.toHaveProperty("content");
  });

  it("el detalle trae el cuerpo y las traducciones", async () => {
    const post = await client.getPost("hola-mundo");

    expect(post.title).toBe("Hola mundo");
    expect(post.content.html).toContain("<p>");
    expect(post.translations).toEqual({ en: "hello-world" });
    expect(post.customFields).toEqual({ cliente: "ACME" });
  });

  it("sirve el idioma pedido", async () => {
    const es = await client.getPost("hola-mundo");
    const en = await client.getPost("hello-world", { locale: "en" });

    expect(es.locale).toBe("es");
    expect(en.locale).toBe("en");
    expect(en.title).toBe("Hello world");
  });

  it("recorre todas las páginas con el generador", async () => {
    const slugs: string[] = [];
    for await (const post of client.iteratePosts({ limit: 2 })) slugs.push(post.slug);

    // 1 original + 5 de relleno en español; el inglés no cuenta sin ?locale.
    expect(slugs).toHaveLength(6);
    expect(new Set(slugs).size).toBe(6);
  });

  it("lista categorías con su conteo", async () => {
    const categories = await client.listCategories();
    const blog = categories.find((c) => c.slug === "blog");

    expect(blog?.postCount).toBe(1);
  });
});

describe("errores", () => {
  it("un slug inexistente es un error reconocible, no un throw genérico", async () => {
    // Es el caso que una web convierte en su propio 404 en lugar de romper
    // el build, así que tiene que poder distinguirse sin leer el mensaje.
    await expect(client.getPost("no-existe")).rejects.toThrow(KontororuError);

    try {
      await client.getPost("no-existe");
    } catch (error) {
      const e = error as KontororuError;
      expect(e.isNotFound).toBe(true);
      expect(e.isRetryable).toBe(false);
      expect(e.status).toBe(404);
    }
  });

  it("una clave inválida da unauthorized y NO se reintenta", async () => {
    const malo = new KontororuClient({ url: API, apiKey: "kntr_live_falsa.inventada", retries: 3 });

    try {
      await malo.listPosts();
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      const e = error as KontororuError;
      expect(e.code).toBe("unauthorized");
      // Reintentar una clave mal configurada sólo gasta el cupo por IP.
      expect(e.isRetryable).toBe(false);
    }
  });

  it("un idioma no activado es bad_request", async () => {
    try {
      await client.listPosts({ locale: "ja" });
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as KontororuError).code).toBe("bad_request");
    }
  });

  it("aborta si el servidor no responde a tiempo", async () => {
    const lento = new KontororuClient({
      url: "http://10.255.255.1",
      apiKey: "kntr_live_x.y",
      timeoutMs: 300,
      retries: 0,
    });

    try {
      await lento.listPosts();
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as KontororuError).code).toBe("network_error");
    }
  }, 15_000);
});

describe("cupo", () => {
  it("expone lo que queda tras cada petición", async () => {
    await client.listPosts({ limit: 1 });

    expect(client.lastRateLimit).not.toBeNull();
    expect(client.lastRateLimit!.limit).toBeGreaterThan(0);
    expect(client.lastRateLimit!.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("webhooks", () => {
  const secret = "secreto-de-prueba";

  const sign = (body: string, timestamp: number) =>
    `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

  const payload = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      event: "post.published",
      tenantId: "t",
      occurredAt: new Date().toISOString(),
      data: {
        id: "p",
        slug: "hola-mundo",
        title: "Hola mundo",
        status: "PUBLISHED",
        categoryId: null,
        locale: "es",
        translations: { en: "hello-world" },
        ...extra,
      },
    });

  it("acepta una entrega legítima y devuelve el payload tipado", () => {
    const body = payload();
    const ts = Math.floor(Date.now() / 1000);

    const result = verifyWebhook({
      body,
      secret,
      headers: { "x-kontororu-timestamp": String(ts), "x-kontororu-signature": sign(body, ts) },
    });

    expect(result.event).toBe("post.published");
    expect(result.data.slug).toBe("hola-mundo");
  });

  it("rechaza una firma alterada", () => {
    const body = payload();
    const ts = Math.floor(Date.now() / 1000);

    expect(() =>
      verifyWebhook({
        body,
        secret,
        headers: {
          "x-kontororu-timestamp": String(ts),
          "x-kontororu-signature": sign(body, ts).replace(/.$/, "0"),
        },
      }),
    ).toThrow(WebhookVerificationError);
  });

  it("rechaza un cuerpo manipulado aunque la firma sea de otro cuerpo válido", () => {
    const original = payload();
    const ts = Math.floor(Date.now() / 1000);
    const firmaValida = sign(original, ts);

    expect(() =>
      verifyWebhook({
        body: payload({ slug: "otra-cosa" }),
        secret,
        headers: { "x-kontororu-timestamp": String(ts), "x-kontororu-signature": firmaValida },
      }),
    ).toThrow(/firma/i);
  });

  it("rechaza un reenvío antiguo pese a llevar firma correcta", () => {
    // El vector que sólo detecta el timestamp: capturar una entrega válida y
    // repetirla más tarde para forzar reconstrucciones.
    const body = payload();
    const viejo = Math.floor(Date.now() / 1000) - 3600;

    try {
      verifyWebhook({
        body,
        secret,
        headers: {
          "x-kontororu-timestamp": String(viejo),
          "x-kontororu-signature": sign(body, viejo),
        },
      });
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as WebhookVerificationError).reason).toBe("stale");
    }
  });

  it("rechaza cuando faltan las cabeceras", () => {
    try {
      verifyWebhook({ body: payload(), secret, headers: {} });
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect((error as WebhookVerificationError).reason).toBe("missing-headers");
    }
  });

  it("acepta también un objeto Headers", () => {
    const body = payload();
    const ts = Math.floor(Date.now() / 1000);
    const headers = new Headers({
      "x-kontororu-timestamp": String(ts),
      "x-kontororu-signature": sign(body, ts),
    });

    expect(verifyWebhook({ body, secret, headers }).data.locale).toBe("es");
  });

  it("affectedTags incluye la URL antigua y las traducciones", () => {
    const body = payload({ previousSlug: "hola-mundo-viejo" });
    const ts = Math.floor(Date.now() / 1000);

    const result = verifyWebhook({
      body,
      secret,
      headers: { "x-kontororu-timestamp": String(ts), "x-kontororu-signature": sign(body, ts) },
    });

    const tags = affectedTags(result);
    expect(tags).toContain("post:hola-mundo");
    // Sin ésta, la página vieja se queda publicada para siempre.
    expect(tags).toContain("post:hola-mundo-viejo");
    // Y sin ésta, el selector de idioma sigue apuntando a la URL anterior.
    expect(tags).toContain("post:hello-world");
    expect(tags).toContain("posts");
  });
});
