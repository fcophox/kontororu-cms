import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { TenantPlan } from "@/lib/auth/plans";

/**
 * Cupos por minuto.
 *
 * El límite es una dimensión del plan, igual que el almacenamiento: quien
 * necesita más tráfico, sube de plan. Los números están holgados a propósito
 * —una web con ISR hace unas pocas peticiones por reconstrucción, no miles—
 * así que llegar al tope suele significar un bucle, no un uso legítimo.
 */
export const PLAN_RATE_LIMITS: Record<TenantPlan, number> = {
  FREE: 60,
  PRO: 600,
  ENTERPRISE: 6000,
};

/**
 * Cupo para peticiones que ni siquiera llegan a autenticarse.
 *
 * Sin esto, probar claves es gratis e ilimitado: el limitador por clave sólo
 * entra en juego DESPUÉS de acertar una. Es el único freno a la fuerza bruta.
 */
export const ANONYMOUS_LIMIT = 30;

/**
 * Cupo del endpoint de reacciones, que tampoco lleva credenciales.
 *
 * Va en su PROPIO cubo, no en el anónimo. El cubo anónimo mide intentos de
 * adivinar una clave; las reacciones son tráfico legítimo sin clave. Si
 * compartieran cubo, una persona leyendo un blog y pulsando "me gusta" en
 * varios artículos se quedaría sin margen para las peticiones que sí
 * importan —y al revés, un ataque de fuerza bruta dejaría a esa web sin
 * poder contar reacciones.
 *
 * 60 por minuto y origen: nadie lee y aprecia un artículo por segundo
 * durante un minuto entero, así que llegar al tope es un script.
 */
export const REACTION_LIMIT = 60;

export const WINDOW_SECONDS = 60;

export type RateVerdict = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

/**
 * La IP se guarda como hash con un secreto de servidor.
 *
 * En claro sería un dato personal en una tabla que no lo necesita: para contar
 * peticiones basta con distinguir orígenes, no con saber cuáles son. El
 * secreto importa — el espacio de IPv4 es pequeño y un hash sin sal se
 * revierte con una tabla precalculada en minutos.
 */
function hashIp(ip: string): string {
  const salt = process.env.CRON_SECRET ?? "kontororu-dev-salt";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  // Railway y la mayoría de proxies ponen la IP real como primer valor.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}

async function consume(bucket: string, limit: number): Promise<RateVerdict> {
  const db = createServiceClient();

  const { data, error } = await db.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });

  const row = data?.[0];

  if (error || !row) {
    // Ante un fallo del limitador se deja pasar la petición.
    //
    // Es una decisión consciente: un problema puntual con la base no debe
    // tumbar las webs de todos los clientes. El riesgo inverso —un abuso
    // colándose durante la incidencia— es mucho menor que el de una caída
    // total, y queda registrado para poder detectarlo.
    console.error("rate limit no disponible, se permite la petición", error);
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAt: new Date(Date.now() + WINDOW_SECONDS * 1000),
    };
  }

  return {
    allowed: row.allowed,
    limit,
    remaining: row.remaining,
    resetAt: new Date(row.reset_at),
  };
}

/** Cupo de una API Key, según el plan de su tenant. */
export function consumeForKey(apiKeyId: string, plan: TenantPlan): Promise<RateVerdict> {
  return consume(`key:${apiKeyId}`, PLAN_RATE_LIMITS[plan]);
}

/** Cupo de intentos sin credenciales válidas, por origen. */
export function consumeForAnonymous(req: Request): Promise<RateVerdict> {
  return consume(`ip:${hashIp(clientIp(req))}`, ANONYMOUS_LIMIT);
}

/** Cupo del endpoint público de reacciones, por origen. */
export function consumeForReactions(req: Request): Promise<RateVerdict> {
  return consume(`react:${hashIp(clientIp(req))}`, REACTION_LIMIT);
}

export function rateLimitHeaders(verdict: RateVerdict): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(verdict.limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(Math.floor(verdict.resetAt.getTime() / 1000)),
  };
}

export function tooManyRequests(verdict: RateVerdict) {
  const retryAfter = Math.max(1, Math.ceil((verdict.resetAt.getTime() - Date.now()) / 1000));

  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: `Has superado el límite de ${verdict.limit} peticiones por minuto. Reintenta en ${retryAfter} s.`,
      },
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(verdict),
        "Retry-After": String(retryAfter),
        // Un 429 cacheado por el CDN bloquearía a todo el mundo hasta que
        // expirase, incluso a quien no ha superado ningún límite.
        "Cache-Control": "no-store",
      },
    },
  );
}
