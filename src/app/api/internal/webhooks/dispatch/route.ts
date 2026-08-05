import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 50;
const MAX_ATTEMPTS = 6;

/**
 * Worker de la cola de webhooks (outbox pattern).
 *
 * El trigger de Postgres encola; este handler entrega. Así una web caída del
 * cliente nunca bloquea un `UPDATE posts`.
 *
 * Vercel Cron lo invoca cada minuto con **GET** (no POST) y
 * `Authorization: Bearer $CRON_SECRET`. Se exportan los dos verbos: GET para
 * el cron, POST para dispararlo a mano durante el desarrollo.
 *
 * El backoff lo decide la base vía `next_attempt_at`; aquí sólo se calcula
 * el siguiente hueco al fallar.
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

  const db = createServiceClient();

  const { data: pending, error } = await db
    .from("webhook_deliveries")
    .select("id, attempt, event, payload, webhook:webhooks(id, url, secret, is_active)")
    .is("delivered_at", null)
    .lt("attempt", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.allSettled(
    (pending ?? []).map((row) => deliver(db, row)),
  );

  // Se aprovecha el mismo tick para purgar contadores de rate limit caducados:
  // un cron dedicado para borrar filas de una tabla efímera no compensa.
  const { data: pruned } = await db.rpc("prune_rate_limits");

  return NextResponse.json({
    processed: results.length,
    failed: results.filter((r) => r.status === "rejected").length,
    rateLimitsPruned: pruned ?? 0,
  });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deliver(db: any, row: any) {
  const hook = row.webhook;
  if (!hook?.is_active) {
    await db.from("webhook_deliveries").update({ delivered_at: new Date().toISOString(), error: "webhook inactivo" }).eq("id", row.id);
    return;
  }

  const body = JSON.stringify(row.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Firma con timestamp para que el receptor pueda rechazar replays.
  const signature = createHmac("sha256", hook.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Kontororu-CMS/1.0",
        "X-Kontororu-Event": row.event,
        "X-Kontororu-Timestamp": timestamp,
        "X-Kontororu-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    await db
      .from("webhook_deliveries")
      .update({
        attempt: row.attempt + 1,
        status_code: res.status,
        delivered_at: res.ok ? new Date().toISOString() : null,
        error: res.ok ? null : `HTTP ${res.status}`,
        next_attempt_at: res.ok ? undefined : backoffFrom(row.attempt),
      })
      .eq("id", row.id);
  } catch (err) {
    await db
      .from("webhook_deliveries")
      .update({
        attempt: row.attempt + 1,
        error: err instanceof Error ? err.message : "error desconocido",
        next_attempt_at: backoffFrom(row.attempt),
      })
      .eq("id", row.id);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 1, 2, 4, 8, 16, 32 minutos. Con seis intentos, la última oportunidad cae
 * algo más de una hora después del primer fallo: tiempo de sobra para que un
 * deploy o una caída breve del cliente se resuelva sola.
 */
function backoffFrom(attempt: number): string {
  // `attempt` llega con el valor ANTES de incrementarse y arranca en 1, así
  // que el -1 es lo que hace que el primer reintento sea a 1 minuto.
  const minutes = 2 ** Math.max(0, attempt - 1);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
