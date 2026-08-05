import { createServiceClient } from "@/lib/supabase/server";
import type { TenantPlan } from "@/lib/auth/plans";
import { apiError } from "./response";
import {
  consumeForAnonymous,
  consumeForKey,
  rateLimitHeaders,
  tooManyRequests,
  type RateVerdict,
} from "./rate-limit";

export type ApiContext = {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
  plan: TenantPlan;
  /** Idioma que se sirve cuando la petición no pide uno. */
  defaultLocale: string;
  /** Idiomas activos: pedir uno fuera de esta lista es un 400, no un vacío. */
  locales: string[];
};

/**
 * Autentica una petición de la API headless.
 *
 * Header: `Authorization: Bearer kntr_live_<prefix>.<secret>`
 *
 * El tenant_id NUNCA lo envía el cliente: se deriva de la clave. Así, aunque
 * un consumidor manipule query params, no puede leer otro tenant.
 */
export async function authenticateRequest(req: Request): Promise<ApiContext | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;

  const sep = token.lastIndexOf(".");
  if (sep <= 0) return null;

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("resolve_api_key", {
    p_prefix: token.slice(0, sep),
    p_secret: token.slice(sep + 1),
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0] as {
    tenant_id: string;
    api_key_id: string;
    scopes: string[];
    plan: TenantPlan;
    default_locale: string;
    locales: string[];
  };

  return {
    tenantId: row.tenant_id,
    apiKeyId: row.api_key_id,
    scopes: row.scopes,
    plan: row.plan,
    defaultLocale: row.default_locale,
    locales: row.locales,
  };
}

export function requireScope(ctx: ApiContext, scope: string): boolean {
  return ctx.scopes.includes(scope) || ctx.scopes.includes("*");
}

export type Guarded =
  | { ok: true; ctx: ApiContext; headers: Record<string, string> }
  | { ok: false; response: Response };

/**
 * Preámbulo único de todo endpoint público: credenciales, cupo y permisos.
 *
 * Cada petición consume UN solo cupo, y cuál depende de si la clave es válida:
 *
 * - Clave válida  → cupo de la clave, según el plan del tenant.
 * - Clave inválida o ausente → cupo por IP, que es el freno a la fuerza bruta.
 *
 * Consumir el cupo por IP también en las peticiones legítimas parece más
 * seguro y es peor: varias webs detrás del mismo proxy —o del mismo runner de
 * CI— comparten IP y se restarían cupo entre ellas, quedando limitadas muy por
 * debajo de lo que pagaron. Se probó así y el plan PRO se comportaba como el
 * anónimo.
 *
 * Verificar la clave antes no abarata la fuerza bruta: `resolve_api_key` sale
 * en la búsqueda por prefijo —indexada— y sólo llega al bcrypt si el prefijo
 * existe, cosa que ya exige acertar 12 caracteres hexadecimales.
 */
export async function guardApiRequest(req: Request, scope: string): Promise<Guarded> {
  const ctx = await authenticateRequest(req);

  if (!ctx) {
    const anonymous: RateVerdict = await consumeForAnonymous(req);
    if (!anonymous.allowed) {
      return { ok: false, response: tooManyRequests(anonymous) };
    }
    return {
      ok: false,
      response: apiError("unauthorized", "API key inválida o revocada."),
    };
  }

  const verdict = await consumeForKey(ctx.apiKeyId, ctx.plan);
  if (!verdict.allowed) {
    return { ok: false, response: tooManyRequests(verdict) };
  }

  if (!requireScope(ctx, scope)) {
    return {
      ok: false,
      response: apiError("forbidden", `Esta clave no tiene el permiso "${scope}".`),
    };
  }

  return { ok: true, ctx, headers: rateLimitHeaders(verdict) };
}
