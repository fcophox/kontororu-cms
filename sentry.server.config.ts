import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/observability/config";

/**
 * Sentry en el servidor de Node: rutas de API, Server Components y acciones.
 *
 * Es donde ocurre lo que de verdad hay que ver — un fallo aquí afecta a la web
 * de un cliente, no a una pestaña.
 */
Sentry.init({
  ...sharedOptions,

  /*
   * No se instrumentan las consultas a Postgres.
   *
   * El SQL que genera PostgREST lleva los filtros dentro, incluido el
   * `tenant_id` y cualquier término de búsqueda que haya escrito una persona.
   * Como traza aporta poco —ya se ve la ruta y su duración— y como fuga
   * aporta bastante.
   */
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== "Postgres"),
});
