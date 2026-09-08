import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { drainWebhookQueue } from "@/lib/content/webhook-dispatch";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Red de seguridad de la cola de webhooks.
 *
 * La entrega en sí vive en `@/lib/content/webhook-dispatch`, porque la
 * publicación la dispara también en el momento (ver `dispatchNow`). Este
 * endpoint es el turno periódico: recoge los reintentos con backoff, lo que
 * quedó de un drenado inmediato que no llegó a tiempo, y lo encolado mientras
 * la app estaba caída.
 *
 * El cron de GitHub Actions (webhooks-cron.yml) lo invoca con **GET** (no POST) y
 * `Authorization: Bearer $CRON_SECRET`. Se exportan los dos verbos: GET para
 * el cron, POST para dispararlo a mano durante el desarrollo.
 */
export async function GET(req: Request) {
  return drain(req);
}

export async function POST(req: Request) {
  return drain(req);
}

async function drain(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let result;
  try {
    result = await drainWebhookQueue();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error desconocido" },
      { status: 500 },
    );
  }

  // Se aprovecha el mismo tick para purgar contadores de rate limit caducados:
  // un cron dedicado para borrar filas de una tabla efímera no compensa. Sólo
  // aquí, no en el drenado inmediato: eso corre dentro de una publicación y no
  // tiene por qué pagar el mantenimiento de otra tabla.
  const { data: pruned } = await createServiceClient().rpc("prune_rate_limits");

  return NextResponse.json({ ...result, rateLimitsPruned: pruned ?? 0 });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
