import * as Sentry from "@sentry/nextjs";

/**
 * Reporte de un error que la aplicación decide tragarse.
 *
 * Son los peores de diagnosticar: la API responde `server_error`, el cliente
 * ve un 500 educado y en el servidor sólo queda una línea en un log que nadie
 * mira. Este helper existe para que ese caso —y sólo ese— quede registrado con
 * el mismo formato en todas partes.
 *
 * Se sigue escribiendo en consola además de enviarlo: en local no hay DSN, y
 * el `console.error` es lo único que se ve mientras se desarrolla.
 */
export function reportError(
  error: unknown,
  { scope, extra }: { scope: string; extra?: Record<string, unknown> },
): void {
  Sentry.captureException(error, {
    tags: { scope },
    extra,
  });

  console.error(scope, error, extra ?? "");
}

/**
 * Marca el evento con el cliente al que pertenece la petición.
 *
 * Es la etiqueta que convierte "hay 300 errores" en "hay 300 errores y todos
 * son del mismo cliente", que son dos incidencias distintas. Sin ella, un
 * fallo que afecta a un solo espacio parece un fallo del producto entero.
 *
 * Va como etiqueta y no como usuario: identifica al cliente contratante, no a
 * la persona que estaba delante.
 */
export function tagTenant(tenant: { id: string; plan?: string | null }): void {
  // En el servidor, Sentry aísla el scope por petición: esto no se filtra a la
  // siguiente ni a otro cliente.
  Sentry.setTag("tenant", tenant.id);
  if (tenant.plan) Sentry.setTag("plan", tenant.plan);
}
