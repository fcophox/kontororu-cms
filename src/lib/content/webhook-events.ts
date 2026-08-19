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
 * Lo que viene marcado al crear un webhook.
 *
 * Incluye `addon.updated` a propósito. Antes se premarcaban sólo los `post.*`
 * —`event.startsWith("post.")`, escrito cuando los complementos aún no
 * emitían nada— y el resultado era que un webhook recién creado no se
 * enteraba de un cambio de disponibilidad del Calendario. Al guardar no salta
 * ningún error: el trigger sólo encola para quien está suscrito, así que el
 * panel dice "Disponibilidad guardada" y la web del cliente sigue ofreciendo
 * las horas viejas, sin nada que señale por qué.
 *
 * El backfill de `20260818000200` cubrió los endpoints que ya existían; esto
 * cubre los que se creen a partir de ahora.
 */
export const WEBHOOK_DEFAULT_EVENTS: readonly WebhookEvent[] = [
  "post.created",
  "post.published",
  "post.updated",
  "post.unpublished",
  "post.deleted",
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
