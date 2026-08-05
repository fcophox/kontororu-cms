import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { PLAN_RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * Rate limiting de la API pública.
 *
 * Se prueba contra la pila real porque lo interesante no es la función SQL
 * aislada, sino que cada petición consuma EL cupo correcto: una regresión aquí
 * no rompe nada visible — simplemente limita a un cliente de pago como si
 * fuese anónimo, o deja la fuerza bruta sin freno.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.TEST_APP_URL ?? "http://localhost:3000";

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
const created: string[] = [];

async function makeTenant(plan: "FREE" | "PRO" | "ENTERPRISE") {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({
      slug: `rl-${plan.toLowerCase()}-${Date.now()}`,
      name: `Rate ${plan}`,
      status: "ACTIVE",
      plan,
    })
    .select("id")
    .single();
  created.push(tenant!.id);

  const { data: key } = await admin.rpc("create_api_key", {
    p_tenant: tenant!.id,
    p_name: "rate",
  });

  return (key as { plain_key: string }[])[0].plain_key;
}

let freeKey: string;
let enterpriseKey: string;

beforeAll(async () => {
  [freeKey, enterpriseKey] = await Promise.all([makeTenant("FREE"), makeTenant("ENTERPRISE")]);
}, 60_000);

afterAll(async () => {
  await admin.from("tenants").delete().in("id", created);
});

const get = (key?: string) =>
  fetch(`${API}/api/v1/posts`, key ? { headers: { Authorization: `Bearer ${key}` } } : undefined);

describe("cabeceras de cupo", () => {
  it("anuncia el límite del plan del tenant", async () => {
    const free = await get(freeKey);
    const enterprise = await get(enterpriseKey);

    expect(free.headers.get("x-ratelimit-limit")).toBe(String(PLAN_RATE_LIMITS.FREE));
    expect(enterprise.headers.get("x-ratelimit-limit")).toBe(
      String(PLAN_RATE_LIMITS.ENTERPRISE),
    );
  });

  it("descuenta peticiones y anuncia cuándo se reinicia", async () => {
    const first = await get(enterpriseKey);
    const second = await get(enterpriseKey);

    const before = Number(first.headers.get("x-ratelimit-remaining"));
    const after = Number(second.headers.get("x-ratelimit-remaining"));
    expect(after).toBeLessThan(before);

    const reset = Number(first.headers.get("x-ratelimit-reset"));
    expect(reset * 1000).toBeGreaterThan(Date.now());
  });
});

describe("aislamiento de cupos", () => {
  it("cada clave consume el suyo", async () => {
    // Si compartieran contador, agotar una tumbaría a la otra: es lo que
    // pasaría con un limitador puramente por IP.
    await Promise.all(Array.from({ length: 5 }, () => get(freeKey)));

    const otherKey = await get(enterpriseKey);
    const remaining = Number(otherKey.headers.get("x-ratelimit-remaining"));

    expect(otherKey.status).toBe(200);
    expect(remaining).toBeGreaterThan(PLAN_RATE_LIMITS.ENTERPRISE - 100);
  });

  it("una clave válida pasa aunque su IP haya fallado autenticaciones", async () => {
    // El cupo por IP sólo cuenta intentos FALLIDOS: un cliente legítimo
    // detrás del mismo proxy que un atacante no debe verse afectado.
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => get(`kntr_live_falsa${i}.inventada`)),
    );

    const legit = await get(enterpriseKey);
    expect(legit.status).toBe(200);
  });
});

describe("respuesta 429", () => {
  it("corta la ráfaga de un plan FREE y explica cuándo reintentar", async () => {
    const limit = PLAN_RATE_LIMITS.FREE;

    // Se dispara todo junto para que quepa en una sola ventana de un minuto.
    const responses = await Promise.all(
      Array.from({ length: limit + 10 }, () => get(freeKey)),
    );

    const ok = responses.filter((r) => r.status === 200).length;
    const limited = responses.filter((r) => r.status === 429);

    expect(ok).toBeLessThanOrEqual(limit);
    expect(limited.length).toBeGreaterThan(0);

    const first = limited[0]!;
    expect(Number(first.headers.get("retry-after"))).toBeGreaterThan(0);
    // Un 429 cacheado por el CDN bloquearía también a quien no ha excedido nada.
    expect(first.headers.get("cache-control")).toContain("no-store");

    const body = await first.json();
    expect(body.error.code).toBe("rate_limited");
  }, 60_000);
});
