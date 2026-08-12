/**
 * Complemento Reacciones — piezas compartidas entre el panel y la API.
 *
 * Módulo PURO: lo importan el route handler público y las pantallas del
 * panel. Nada de `next/headers` ni de Supabase aquí.
 */

import { z } from "zod";

/** `reaction_key` admitido: minúsculas, sin espacios. Igual que el CHECK de la base. */
export const REACTION_KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

/**
 * Etiqueta legible de un gesto.
 *
 * Se deriva de la clave, como en Contactos: el cliente inventa sus propios
 * gestos y un diccionario en código se quedaría corto el primer día. Los
 * cuatro habituales sí llevan nombre propio porque son los que se van a ver
 * en el 95 % de los espacios y "APLAUSO" se lee peor que "Aplausos".
 */
const KNOWN: Record<string, string> = {
  like: "Me gusta",
  clap: "Aplausos",
  smile: "Sonrisas",
  heart: "Corazones",
};

export function reactionLabel(key: string): string {
  return KNOWN[key] ?? key.replace(/[-_]+/g, " ");
}

/**
 * Clic entrante.
 *
 * `tenant` viaja en el cuerpo porque este endpoint NO lleva API Key: sin él
 * no hay forma de saber a qué espacio pertenece el artículo. Es el slug
 * público del espacio, el mismo que ya está en la URL del panel — no es un
 * secreto y no sirve para leer nada que no sea público.
 *
 * `locale` es opcional y casi nunca hace falta: el contador es del contenido,
 * no del idioma. Sólo desempata el caso raro de dos contenidos distintos que
 * comparten slug en idiomas distintos.
 */
export const ReactionInput = z.object({
  tenant: z.string().trim().min(1).max(63),
  slug: z.string().trim().min(1).max(200),
  reaction: z
    .string()
    .trim()
    .regex(REACTION_KEY_RE, "El gesto admite minúsculas, números, guion y guion bajo (2-40 caracteres)")
    .default("like"),
  locale: z.string().trim().max(10).optional(),
});

export type ReactionInput = z.infer<typeof ReactionInput>;

/** Contadores de un contenido, `gesto -> número`. */
export type ReactionTotals = Record<string, number>;

export function asTotals(rows: { reaction_key: string; total: number | string }[] | null): ReactionTotals {
  const out: ReactionTotals = {};
  for (const row of rows ?? []) out[row.reaction_key] = Number(row.total);
  return out;
}

/** Suma de todos los gestos: el número que se enseña en un listado. */
export function sumTotals(totals: ReactionTotals): number {
  return Object.values(totals).reduce((acc, n) => acc + n, 0);
}
