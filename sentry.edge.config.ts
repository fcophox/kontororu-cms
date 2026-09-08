import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/observability/config";

/**
 * Sentry en el runtime edge, que aquí es sólo el middleware.
 *
 * El middleware refresca la sesión en CADA navegación del panel: si falla,
 * falla todo a la vez y sin dejar rastro en ninguna ruta concreta. Es
 * justamente el sitio donde un error se diagnostica mal sin telemetría.
 */
Sentry.init(sharedOptions);
