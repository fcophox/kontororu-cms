import { asRecord } from "@/lib/content/json";

/**
 * Claves de campos personalizados compartidas entre los idiomas de un contenido.
 *
 * Un campo personalizado describe el contenido —"duración", "cliente", "URL de
 * demo"—, y eso no cambia porque se lea en inglés. Pero cada idioma es un post
 * propio con su `custom_fields`, así que un campo añadido después de traducir
 * se quedaba sólo en el idioma donde se creó: la web pedía `duracion` y la
 * versión inglesa no lo traía.
 *
 * Lo que se comparte es la CLAVE, no el valor: "3 meses" y "3 months" son el
 * mismo campo con texto distinto, y forzar un único valor sacaría español en
 * la web inglesa.
 */

/**
 * Une las claves de varios registros conservando el orden del primero.
 *
 * El primero manda porque es el contenido que se está editando: sus campos
 * siguen donde el usuario los dejó, y los que sólo existen en otros idiomas
 * se añaden al final en vez de reordenarle el panel.
 */
export function unionFieldKeys(...records: unknown[]): string[] {
  const keys: string[] = [];

  for (const record of records) {
    for (const key of Object.keys(asRecord(record))) {
      if (!keys.includes(key)) keys.push(key);
    }
  }

  return keys;
}

/**
 * Reescribe un registro para que tenga exactamente `keys`.
 *
 * Los valores ya escritos se respetan; las claves nuevas entran vacías para
 * que alguien las rellene en ese idioma. Las que sobran desaparecen: borrar un
 * campo tiene que borrarlo del contenido entero, no dejarlo escondido en las
 * traducciones.
 */
export function alignFields(
  current: unknown,
  keys: string[],
): Record<string, unknown> {
  const source = asRecord(current);
  const next: Record<string, unknown> = {};

  for (const key of keys) next[key] = source[key] ?? "";

  return next;
}

/**
 * `true` si el registro ya tiene ese conjunto de claves, en cualquier orden.
 *
 * Sirve para no escribir cuando no hay nada que cambiar: cada escritura sobre
 * `custom_fields` genera una revisión, y sincronizar no es una edición que
 * merezca aparecer en el historial.
 */
export function hasSameFieldKeys(current: unknown, keys: string[]): boolean {
  const existing = Object.keys(asRecord(current));
  return existing.length === keys.length && keys.every((k) => existing.includes(k));
}
