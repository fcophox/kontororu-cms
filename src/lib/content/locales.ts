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
