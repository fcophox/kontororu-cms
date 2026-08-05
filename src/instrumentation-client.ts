import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/observability/config";

/**
 * Sentry en el navegador: el panel de administración.
 *
 * Lo que se busca aquí son los fallos que el servidor no ve — el editor que
 * revienta al pegar contenido, la subida que se queda a medias— y que hoy sólo
 * se detectan si el cliente se molesta en avisar.
 */
Sentry.init({
  ...sharedOptions,

  /*
   * Session Replay se queda fuera.
   *
   * Graba lo que hay en pantalla, y lo que hay en pantalla en este producto es
   * el contenido sin publicar de un cliente. El enmascarado de Replay va por
   * heurística sobre el DOM y el editor es contenido enriquecido: bastaría un
   * caso mal enmascarado para tener un borrador ajeno guardado en un servicio
   * de terceros.
   */
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

/** Necesario para que Sentry mida las navegaciones del App Router. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
