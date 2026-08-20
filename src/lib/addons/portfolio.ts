/**
 * Complemento Portfolio — forma y reglas de su configuración.
 *
 * Módulo PURO: lo comparten el drawer de ajustes (cliente) y la acción que
 * guarda (servidor). Un solo sitio decide qué galerías existen, así que el
 * panel no puede ofrecer una opción que el guardado rechace.
 */

import { z } from "zod";

/**
 * Las tres galerías, con lo que cada una significa.
 *
 * Viven aquí y no en la base por lo mismo que el catálogo de complementos:
 * cada una es una maquetación concreta que la web del cliente tiene que saber
 * pintar, y poder elegir una que nadie ha implementado deja la sección rota.
 *
 * `layout` no es decoración del panel: sale por la API y va en el encargo al
 * equipo que monta la web. Sin él, «Galería 2» significaba lo que cada
 * front-end quisiera, y el cliente elegía a ciegas entre tres etiquetas.
 * Cambiar un valor de aquí cambia lo que ya está publicado en las webs que lo
 * leen, así que se añaden galerías nuevas en vez de redefinir las que hay.
 */
export const GALLERY_OPTIONS = [
  {
    value: "gallery-1",
    label: "Galería 1",
    summary: "Rejilla clásica, con el texto bajo cada imagen.",
    layout: {
      /** Tarjetas por fila. El móvil siempre va a una, no se declara. */
      columns: 3,
      /** Proporción a la que se recorta la imagen. */
      aspect: "4/3",
      /** Dónde va el texto respecto de la imagen. */
      textPlacement: "below",
      /** Si la descripción se pinta en la tarjeta o se guarda para el detalle. */
      showsDescription: true,
    },
  },
  {
    value: "gallery-2",
    label: "Galería 2",
    summary: "Mosaico a dos columnas; el texto aparece sobre la imagen.",
    layout: {
      columns: 2,
      // La imagen manda: es la galería para trabajo visual, donde recortar
      // todo a la misma caja estropea justo lo que se quiere enseñar.
      aspect: "original",
      textPlacement: "overlay",
      showsDescription: false,
    },
  },
  {
    value: "gallery-3",
    label: "Galería 3",
    summary: "Una por fila, imagen grande y texto al lado.",
    layout: {
      columns: 1,
      aspect: "16/9",
      textPlacement: "beside",
      showsDescription: true,
    },
  },
] as const;

export type GalleryLayout = (typeof GALLERY_OPTIONS)[number]["layout"];

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
/**
 * La maquetación de una galería.
 *
 * Devuelve la de `gallery-1` si la clave no se reconoce: es preferible a un
 * `undefined` que obligaría a comprobarlo en cada consumo, y una galería
 * desconocida sólo puede venir de una configuración anterior a un cambio.
 */
export function galleryLayout(value: string): GalleryLayout {
  const found = GALLERY_OPTIONS.find((option) => option.value === value);
  return (found ?? GALLERY_OPTIONS[0]).layout;
}

export function parsePortfolioSettings(raw: unknown): PortfolioSettings {
  const parsed = PortfolioSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : PortfolioSettingsSchema.parse({});
}
