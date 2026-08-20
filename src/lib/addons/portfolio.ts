/**
 * Complemento Portfolio — forma y reglas de su configuración.
 *
 * Módulo PURO: lo comparten el drawer de ajustes (cliente) y la acción que
 * guarda (servidor). Un solo sitio decide qué galerías existen, así que el
 * panel no puede ofrecer una opción que el guardado rechace.
 */

import { z } from "zod";

/**
 * Las galerías disponibles. Viven aquí y no en la base por lo mismo que el
 * catálogo de complementos: cada una será una plantilla que se despliega con
 * la aplicación, y poder elegir una que este despliegue no sabe pintar deja
 * la web del cliente sin portfolio.
 */
export const GALLERY_OPTIONS = [
  { value: "gallery-1", label: "Galería 1" },
  { value: "gallery-2", label: "Galería 2" },
  { value: "gallery-3", label: "Galería 3" },
] as const;

export type GalleryValue = (typeof GALLERY_OPTIONS)[number]["value"];

const GalleryEnum = z.enum(
  GALLERY_OPTIONS.map((o) => o.value) as [GalleryValue, ...GalleryValue[]],
);

/**
 * Un trabajo del portfolio.
 *
 * Los elementos viven dentro de `settings` y no en una tabla propia: mientras
 * el complemento sea una lista corta que el cliente ordena a mano, una tabla
 * sería una migración para guardar lo que el JSONB ya guarda. Si el portfolio
 * crece hasta necesitar filtros, paginado o consultas por categoría, el sitio
 * de los elementos es una tabla y esto se migra.
 */
export const PortfolioItemSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "El título es obligatorio").max(120),
  description: z.string().trim().max(600).default(""),
  /** URL firmada de la imagen subida a la mediateca. Vacía = elemento sin foto. */
  imageUrl: z.string().trim().default(""),
  /**
   * Id en `media`. La URL caduca, el id no: es lo que permitirá volver a
   * firmar la imagen cuando el endpoint público sirva el portfolio.
   */
  imageMediaId: z.string().trim().default(""),
  /** Enlace al trabajo publicado fuera del sitio. Opcional a propósito. */
  externalUrl: z.union([z.url("El enlace no es una URL válida"), z.literal("")]).default(""),
  category: z.string().trim().max(60).default(""),
  createdAt: z.string(),
});

export type PortfolioItem = z.infer<typeof PortfolioItemSchema>;

export const PortfolioSettingsSchema = z.object({
  gallery: GalleryEnum.default("gallery-1"),
  /**
   * Interruptor de visibilidad en la web del cliente.
   *
   * Separado de tener el complemento activo: activarlo da acceso al panel y
   * permite ir montando el portfolio con calma, y esto decide cuándo eso sale
   * publicado. Sin la separación, el primer trabajo a medio escribir ya
   * estaría en la web. Arranca apagado por lo mismo.
   */
  isPublished: z.boolean().default(false),
  /**
   * Los elementos que no cumplen el esquema se descartan uno a uno en vez de
   * tumbar la lista entera: un elemento roto no debería vaciar el portfolio.
   */
  items: z.array(z.unknown()).default([]).transform((raw) =>
    raw.flatMap((entry) => {
      const parsed = PortfolioItemSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

export type PortfolioSettings = z.infer<typeof PortfolioSettingsSchema>;

/**
 * Lee lo guardado en `tenant_addons.settings`, que es JSONB libre.
 *
 * Nunca lanza: una configuración corrupta —o de una versión anterior con una
 * galería que ya no existe— devuelve los valores por defecto. La pantalla de
 * un complemento activo no debería reventar por un campo de más.
 */
export function parsePortfolioSettings(raw: unknown): PortfolioSettings {
  const parsed = PortfolioSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : PortfolioSettingsSchema.parse({});
}
