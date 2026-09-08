import { createHmac } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Worker de la cola de webhooks (outbox pattern).
 *
 * Vive aquí y no en el route handler porque tiene DOS disparadores:
 *
 *  - El cron de GitHub Actions, cada 5 minutos, vía
 *    `/api/internal/webhooks/dispatch`. Es la red de seguridad: recoge los
 *    reintentos con backoff y lo que se quedó atrás.
 *  - La propia acción de publicar, en el mismo instante, vía `dispatchNow()`.
 *    Es lo que hace que la web del cliente se entere en segundos en lugar de
 *    en el próximo turno del cron.
 *
 * El primero por sí solo funcionaba, pero imponía hasta cinco minutos de
 * espera —los cron de Actions ni siquiera son puntuales— a algo que el editor
 * acaba de pulsar y está mirando.
 */

const BATCH = 50;
const MAX_ATTEMPTS = 6;

/** Ventana de reserva: lo que un drenado tarda como mucho en soltar una fila. */
const CLAIM_SECONDS = 120;

export type DrainResult = {
  processed: number;
  delivered: number;
  failed: number;
  skipped: number;
  deferred: number;
};

type Outcome = "delivered" | "failed" | "skipped" | "deferred";

/**
 * Entrega las entregas pendientes que ya han vencido.
 *
 * `tenantId` acota el drenado a un solo espacio: cuando lo llama una acción de
 * publicar, no tiene por qué gastar su lote en los reintentos de otro cliente
 * cuya web lleva media hora caída. El cron llama sin acotar.
 */
export async function drainWebhookQueue(opts: { tenantId?: string } = {}): Promise<DrainResult> {
  const db = createServiceClient();

  let query = db
    .from("webhook_deliveries")
    .select("id, attempt, event, payload, next_attempt_at, webhook:webhooks(id, url, secret, is_active)")
    .is("delivered_at", null)
    .lt("attempt", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);

  const { data: pending, error } = await query;
  if (error) throw new Error(error.message);

  const results = await Promise.allSettled(
    (pending ?? []).map((row) => deliver(db, row)),
  );

  const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value : "failed"));

  return {
    // Las reservadas por otro drenado no cuentan como procesadas: no se ha
    // intentado nada con ellas y sumarlas inflaría el resumen del cron.
    processed: outcomes.filter((o) => o !== "deferred").length,
    delivered: outcomes.filter((o) => o === "delivered").length,
    /*
     * `failed` cuenta lo que NO llegó, no sólo lo que reventó.
     *
     * Antes se calculaba con las promesas rechazadas, y `deliver()` sólo
     * rechaza ante un fallo de red: un destino devolviendo 404 en cada intento
     * se registraba en la fila y el worker respondía `failed: 0`. Con la web
     * de un cliente caída, la única señal era un contador diciendo que todo
     * iba bien — que es como estos webhooks pasaron diez días sin salir.
     */
    failed: outcomes.filter((o) => o === "failed").length,
    // Webhooks desactivados entre encolar y entregar: ni error ni entrega.
    skipped: outcomes.filter((o) => o === "skipped").length,
    // Cogidas por el otro disparador mientras este lote estaba en vuelo.
    deferred: outcomes.filter((o) => o === "deferred").length,
  };
}

/**
 * Dispara un drenado sin bloquear al usuario ni tumbar la acción si falla.
 *
 * Se llama desde Server Actions dentro de `after()`. Un webhook que no sale no
 * puede hacer que "Publicar" devuelva un error: el contenido YA está
 * publicado, y el cron recogerá la entrega en el próximo turno. Por eso aquí
 * se traga la excepción y sólo se registra.
 */
export async function dispatchNow(tenantId: string): Promise<void> {
  try {
    await drainWebhookQueue({ tenantId });
  } catch (err) {
    console.error("Drenado inmediato de webhooks fallido; queda para el cron", err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deliver(db: any, row: any): Promise<Outcome> {
  const hook = row.webhook;
  if (!hook?.is_active) {
    await db
      .from("webhook_deliveries")
      .update({ delivered_at: new Date().toISOString(), error: "webhook inactivo" })
      .eq("id", row.id);
    return "skipped";
  }

  /*
   * Reserva optimista antes de salir a la red.
   *
   * Con dos disparadores hay drenados solapados: el cron y una publicación
   * pueden coger la misma fila y entregarla dos veces. El `eq` sobre el
   * `next_attempt_at` que se leyó es el que decide — sólo uno de los dos
   * encuentra la fila con ese valor, el otro la ve ya movida y se retira.
   */
  const { data: claimed } = await db
    .from("webhook_deliveries")
    .update({ next_attempt_at: new Date(Date.now() + CLAIM_SECONDS * 1000).toISOString() })
    .eq("id", row.id)
    .eq("next_attempt_at", row.next_attempt_at)
    .is("delivered_at", null)
    .select("id");

  if (!claimed?.length) return "deferred";

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

    return res.ok ? "delivered" : "failed";
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
export function backoffFrom(attempt: number): string {
  // `attempt` llega con el valor ANTES de incrementarse y arranca en 1, así
  // que el -1 es lo que hace que el primer reintento sea a 1 minuto.
  const minutes = 2 ** Math.max(0, attempt - 1);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
