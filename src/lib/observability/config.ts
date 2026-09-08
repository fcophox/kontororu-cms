import { scrubEvent } from "./scrub";

/**
 * Opciones comunes a los tres runtimes (servidor, edge y navegador).
 *
 * Están juntas porque la parte que importa —el saneado— tiene que ser
 * idéntica en los tres. Tres ficheros de configuración copiados divergen a la
 * primera corrección, y aquí divergir significa que un runtime empieza a
 * mandar cookies mientras los otros no.
 */

/**
 * Sin DSN, Sentry no hace nada.
 *
 * Es lo que permite que el proyecto siga arrancando y pasando los tests sin
 * cuenta de Sentry: en local no hay DSN, así que `init()` es una función vacía
 * y no hay que envolver ninguna llamada en un `if`.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

export const SENTRY_ENABLED = Boolean(SENTRY_DSN);

/**
 * Muestreo de trazas.
 *
 * Las trazas se facturan por volumen, así que el valor por defecto es
 * conservador y se sube con `SENTRY_TRACES_SAMPLE_RATE` cuando haga falta
 * mirar rendimiento. Los ERRORES no se muestrean: se envían todos.
 */
function tracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return process.env.NODE_ENV === "production" ? 0.1 : 0;
}

export const sharedOptions = {
  dsn: SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Permite saber en qué despliegue pasó algo sin tener que adivinarlo.
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  tracesSampleRate: tracesSampleRate(),

  /*
   * `sendDefaultPii` se queda en false a propósito.
   *
   * Activarlo añade IP y correo del usuario a cada evento. En un CMS que
   * gestiona varios clientes eso convierte el panel de errores en un registro
   * de quién estaba trabajando y desde dónde, que no hace falta para arreglar
   * un fallo.
   */
  sendDefaultPii: false,

  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,

  /*
   * Ruido que no es nuestro.
   *
   * Un error de red de una extensión del navegador o un `AbortError` de una
   * navegación cancelada no son fallos del CMS: llenan el panel y esconden lo
   * que sí importa.
   */
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "AbortError",
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ] as (string | RegExp)[],
};
