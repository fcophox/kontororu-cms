import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Aislamiento a través de la pila real: PostgREST, Storage y la API headless.
 *
 * Los tests pgTAP validan las políticas dentro de Postgres. Estos validan
 * lo que un atacante puede alcanzar de verdad — un `curl` contra PostgREST
 * o el endpoint público — donde además intervienen la serialización, los
 * embeds de relaciones y las signed URLs.
 *
 *   supabase start && npx vitest run tests/integration
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

type Fixture = {
  tenantId: string;
  userId: string;
  client: SupabaseClient;
  postId: string;
  mediaPath: string;
  apiKey: string;
};

const created: { users: string[]; tenants: string[] } = { users: [], tenants: [] };

async function makeTenant(name: string): Promise<Fixture> {
  const email = `${name}-${Date.now()}@test.local`;
  const password = "Password123!";

  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  created.users.push(user.user.id);

  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .insert({ slug: `${name}-${Date.now()}`, name, status: "ACTIVE" })
    .select("id")
    .single();
  if (tErr) throw tErr;
  created.tenants.push(tenant.id);

  await admin
    .from("tenant_users")
    .insert({ tenant_id: tenant.id, user_id: user.user.id, role: "OWNER" });

  const { data: post } = await admin
    .from("posts")
    .insert({
      tenant_id: tenant.id,
      author_id: user.user.id,
      slug: `post-${name}`,
      title: `Post de ${name}`,
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const mediaPath = `${tenant.id}/2026/08/${crypto.randomUUID()}.txt`;
  await admin.storage
    .from("tenant-media")
    .upload(mediaPath, new Blob([`secreto de ${name}`]), { contentType: "text/plain" });

  const { data: key } = await admin.rpc("create_api_key", {
    p_tenant: tenant.id,
    p_name: "test",
  });

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return {
    tenantId: tenant.id,
    userId: user.user.id,
    client,
    postId: post!.id,
    mediaPath,
    apiKey: (key as { plain_key: string }[])[0].plain_key,
  };
}

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  [a, b] = await Promise.all([makeTenant("alpha"), makeTenant("beta")]);
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created.tenants);
  await Promise.all(created.users.map((id) => admin.auth.admin.deleteUser(id)));
});

describe("PostgREST", () => {
  it("no devuelve posts de otro tenant ni pidiéndolos por id", async () => {
    const { data } = await a.client.from("posts").select("*").eq("id", b.postId);
    expect(data).toEqual([]);
  });

  it("no filtra datos ajenos a través de un embed de relaciones", async () => {
    // Vector clásico: la tabla raíz está protegida, la anidada no.
    const { data } = await a.client
      .from("posts")
      .select("id, tenant:tenants(id, slug, limits), author:users_profiles(email)");

    // El embed llega como objeto o array según la cardinalidad que infiera
    // PostgREST; se normaliza antes de comparar.
    const tenantIds = new Set(
      (data ?? []).flatMap((r) => {
        const t = r.tenant as unknown as { id: string } | { id: string }[] | null;
        if (!t) return [];
        return Array.isArray(t) ? t.map((x) => x.id) : [t.id];
      }),
    );
    expect([...tenantIds]).toEqual([a.tenantId]);
  });

  it("no permite escribir en el tenant ajeno", async () => {
    const { error } = await a.client
      .from("posts")
      .insert({ tenant_id: b.tenantId, slug: "intruso", title: "Intruso" });
    expect(error).not.toBeNull();
  });

  it("un UPDATE cruzado no afecta a ninguna fila", async () => {
    await a.client.from("posts").update({ title: "HACKED" }).eq("id", b.postId);
    const { data } = await admin.from("posts").select("title").eq("id", b.postId).single();
    expect(data!.title).not.toBe("HACKED");
  });

  it("el anónimo no alcanza las tablas de negocio", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.from("posts").select("id");
    expect(error ?? data).not.toEqual(expect.arrayContaining([expect.anything()]));
  });
});

describe("Storage", () => {
  it("no descarga objetos de otro tenant", async () => {
    const { data, error } = await a.client.storage.from("tenant-media").download(b.mediaPath);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("no firma URLs de objetos de otro tenant", async () => {
    const { data } = await a.client.storage
      .from("tenant-media")
      .createSignedUrl(b.mediaPath, 60);
    expect(data?.signedUrl).toBeUndefined();
  });

  it("no lista el directorio de otro tenant", async () => {
    const { data } = await a.client.storage.from("tenant-media").list(b.tenantId);
    expect(data ?? []).toEqual([]);
  });

  it("no escribe fuera de su propio prefijo", async () => {
    const { error } = await a.client.storage
      .from("tenant-media")
      .upload(`${b.tenantId}/2026/08/inyectado.txt`, new Blob(["x"]));
    expect(error).not.toBeNull();
  });
});

describe("API headless", () => {
  const get = (path: string, key: string) =>
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });

  it("sólo devuelve contenido del tenant dueño de la key", async () => {
    const res = await get("/api/v1/posts", a.apiKey);
    expect(res.ok).toBe(true);
    const body = await res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(a.postId);
    expect(ids).not.toContain(b.postId);
  });

  it("rechaza una key inexistente", async () => {
    const res = await get("/api/v1/posts", "kntr_live_deadbeef.falsa");
    expect(res.status).toBe(401);
  });

  it("rechaza una key revocada", async () => {
    const { data: key } = await admin.rpc("create_api_key", {
      p_tenant: a.tenantId,
      p_name: "revocada",
    });
    const plain = (key as { id: string; plain_key: string }[])[0];
    await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", plain.id);

    const res = await get("/api/v1/posts", plain.plain_key);
    expect(res.status).toBe(401);
  });

  it("ignora un tenant_id inyectado por query string", async () => {
    // El tenant se deriva de la key, nunca del request.
    const res = await get(`/api/v1/posts?tenant_id=${b.tenantId}`, a.apiKey);
    const body = await res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(b.postId);
  });

  it("no expone borradores por la API pública", async () => {
    await admin.from("posts").insert({
      tenant_id: a.tenantId,
      author_id: a.userId,
      slug: "borrador-privado",
      title: "Borrador privado",
      status: "DRAFT",
    });

    const res = await get("/api/v1/posts", a.apiKey);
    const body = await res.json();
    const slugs = body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain("borrador-privado");
  });
});
