/**
 * Slugs para URLs de contenido. Únicos por tenant, no globalmente:
 * dos clientes pueden tener ambos `/blog/sobre-nosotros`.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos: "diseño" → "diseno"
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-$/, "");
}

/**
 * Versión para ir formateando MIENTRAS se escribe.
 *
 * `slugify` recorta los guiones de los extremos, y eso hace imposible teclear:
 * al pulsar el espacio de "hola mundo" el guion desaparecería, y la siguiente
 * letra se pegaría a la palabra anterior — "holamundo".
 *
 * Así que aquí se conserva el guion final y sólo se limpia el del principio,
 * que nunca es intencionado. Al salir del campo se aplica `slugify` completo,
 * que ya sí deja el resultado definitivo.
 */
export function slugifyLive(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos: "diseño" → "diseno"
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80);
}

/**
 * Resuelve colisiones añadiendo sufijo numérico: `mi-post`, `mi-post-2`…
 * `taken` son los slugs ya existentes en ESE tenant.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = slugify(base) || "sin-titulo";
  if (!used.has(slug)) return slug;

  let n = 2;
  while (used.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/** Estimación de lectura: 200 palabras/minuto, mínimo 1. */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
