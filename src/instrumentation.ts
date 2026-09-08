import * as Sentry from "@sentry/nextjs";

/**
 * Punto de arranque de la instrumentación del servidor.
 *
 * Next lo ejecuta una vez por runtime, antes que nada. La carga es dinámica y
 * condicionada porque el bundle de edge no puede contener el SDK de Node ni al
 * revés: importarlos arriba rompe el build del middleware.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Errores de Server Components, rutas de API y acciones de servidor.
 *
 * Sin este hook, un fallo dentro de un Server Component se convierte en un
 * `digest` opaco en el navegador y no llega a ninguna parte: es exactamente el
 * caso que hoy obliga a rebuscar en los logs del proveedor.
 */
export const onRequestError = Sentry.captureRequestError;
