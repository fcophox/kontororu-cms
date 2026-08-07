import { DEFAULT_THEME, THEME_MODES, type ThemeMode } from "@/lib/tokens.generated";

export { DEFAULT_THEME, THEME_MODES };
export type { ThemeMode };

/** Clave de localStorage donde se guarda la elección del usuario. */
export const THEME_STORAGE_KEY = "kntr-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Aplica el tema al <html>. Las dos clases son excluyentes: `.dark` la
 * necesitan las variantes `dark:` de Tailwind, `.light` activa el bloque de
 * overrides claros de tokens.generated.css.
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
}
