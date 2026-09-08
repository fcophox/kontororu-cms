/**
 * Catálogo de eventos de webhook.
 *
 * Vive aquí y no en `actions.ts` porque un archivo `"use server"` sólo puede
 * exportar funciones async: cualquier constante que necesiten a la vez el
 * servidor y la UI tiene que estar en un módulo neutral.
 *
 * El orden y los identificadores deben coincidir con el enum `webhook_event`
 * de Postgres.
 */
export const WEBHOOK_EVENTS = [
  "post.created",
  "post.published",
  "post.updated",
  "post.unpublished",
  "post.deleted",
  "category.updated",
  "media.deleted",
  "addon.updated",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Lo que viene marcado al crear un webhook: TODO el catálogo.
 *
 * Es una lista explícita y no `WEBHOOK_EVENTS` entero para que añadir un
 * evento nuevo obligue a decidir aquí si entra por defecto. Ese despiste es
 * exactamente el que costó los dos fallos que la trajeron:
 *
 *  - Se premarcaban sólo los `post.*` —`event.startsWith("post.")`, escrito
 *    cuando los complementos aún no emitían nada—, así que un webhook recién
 *    creado no se enteraba de un cambio de disponibilidad del Calendario.
 *  - `category.updated` y `media.deleted` llevaban desde el esquema inicial
 *    en el enum y en el panel sin que NADA los emitiera.
 *
 * Los dos fallan en silencio: el trigger sólo encola para quien está
 * suscrito, así que no hay error en ningún lado — el panel confirma que ha
 * guardado y la web del cliente sigue mostrando lo viejo.
 *
 * Los backfills de `20260818000200` y `20260819000000` cubrieron los
 * endpoints que ya existían; esto cubre los que se creen a partir de ahora.
 */
export const WEBHOOK_DEFAULT_EVENTS: readonly WebhookEvent[] = [
  "post.created",
  "post.published",
  "post.updated",
  "post.unpublished",
  "post.deleted",
  "category.updated",
  "media.deleted",
  "addon.updated",
];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "post.created": "Contenido creado",
  "post.published": "Contenido publicado",
  "post.updated": "Contenido actualizado",
  "post.unpublished": "Contenido despublicado",
  "post.deleted": "Contenido eliminado",
  "category.updated": "Categoría modificada",
  "media.deleted": "Archivo eliminado",
  "addon.updated": "Complemento reconfigurado",
};
