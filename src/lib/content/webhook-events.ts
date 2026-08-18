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
