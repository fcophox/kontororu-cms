/**
 * Idiomas ofrecidos por el CMS.
 *
 * Lista cerrada a propósito: dejar escribir un código libre acaba con "en",
 * "EN" y "en_US" conviviendo para el mismo idioma, y el contenido queda
 * repartido entre variantes que nadie consulta. Ampliarla es una línea.
 */
export const AVAILABLE_LOCALES = [
  { code: "es", label: "Español" },
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
  { code: "pt-BR", label: "Portugués (Brasil)" },
  { code: "fr", label: "Francés" },
  { code: "de", label: "Alemán" },
  { code: "it", label: "Italiano" },
  { code: "ca", label: "Catalán" },
  { code: "gl", label: "Gallego" },
  { code: "eu", label: "Euskera" },
] as const;

export type LocaleCode = (typeof AVAILABLE_LOCALES)[number]["code"];

export function localeLabel(code: string): string {
  return AVAILABLE_LOCALES.find((l) => l.code === code)?.label ?? code;
}

export function isKnownLocale(code: string): boolean {
  return AVAILABLE_LOCALES.some((l) => l.code === code);
}

/** Una versión de un contenido: qué idioma es y si está viva en la web. */
export type LocaleVersion = {
  id: string;
  locale: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

/**
 * Los idiomas de un contenido llegan del inventario como `jsonb`, así que
 * Postgres los entrega sin tipo. Se validan en lugar de castearse: una fila
 * con la agregación a medias reventaría el render de todo el listado.
 */
export function asLocaleVersions(value: unknown): LocaleVersion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (row === null || typeof row !== "object") return [];

    const v = row as { id?: unknown; locale?: unknown; status?: unknown };
    const isValid =
      typeof v.id === "string" &&
      typeof v.locale === "string" &&
      (v.status === "DRAFT" || v.status === "PUBLISHED" || v.status === "ARCHIVED");

    return isValid ? [{ id: v.id as string, locale: v.locale as string, status: v.status as LocaleVersion["status"] }] : [];
  });
}

/**
 * El original primero; el resto en el orden que trae la consulta.
 *
 * Importa porque el listado lee de izquierda a derecha: el primer badge dice
 * en qué idioma se escribió el contenido, y los siguientes qué traducciones
 * tiene.
 */
export function orderVersions(
  versions: LocaleVersion[],
  originalLocale: string,
): LocaleVersion[] {
  return [
    ...versions.filter((v) => v.locale === originalLocale),
    ...versions.filter((v) => v.locale !== originalLocale),
  ];
}
