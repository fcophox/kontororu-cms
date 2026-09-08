/* Generado por scripts/generate-tokens.mjs desde tokens.yml — NO EDITAR. */

/** Tokens presentes en ambos temas (tipografía, radios, espaciado…). */
export const SHARED_TOKENS = {
  "--font-sans-stack": "var(--font-sansation), system-ui, sans-serif",
  "--font-mono-stack": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "--radius": "0.625rem",
  "--spacing-xs": "0.25rem",
  "--spacing-sm": "0.5rem",
  "--spacing-md": "1rem",
  "--spacing-lg": "1.5rem",
  "--spacing-xl": "2rem",
  "--spacing-2xl": "4rem",
  "--anim-fast": "150ms",
  "--anim-normal": "300ms",
  "--anim-slow": "500ms",
  "--breakpoint-sm": "40rem",
  "--breakpoint-md": "48rem",
  "--breakpoint-lg": "64rem",
  "--breakpoint-xl": "80rem",
  "--breakpoint-2xl": "96rem"
} as const;

/** Tokens del tema claro. */
export const LIGHT_TOKENS = {
  "--background": "#ffffff",
  "--foreground": "#0a0a0a",
  "--card": "#ffffff",
  "--card-foreground": "#0a0a0a",
  "--popover": "#ffffff",
  "--popover-foreground": "#0a0a0a",
  "--primary": "#111827",
  "--primary-foreground": "#ffffff",
  "--secondary": "#f4f4f5",
  "--secondary-foreground": "#18181b",
  "--accent": "#f4f4f5",
  "--accent-foreground": "#18181b",
  "--muted": "#f4f4f5",
  "--muted-foreground": "#71717a",
  "--border": "#e4e4e7",
  "--input": "#e4e4e7",
  "--ring": "#111827",
  "--sidebar": "#fafafa",
  "--sidebar-foreground": "#0a0a0a",
  "--sidebar-primary": "#111827",
  "--sidebar-primary-foreground": "#ffffff",
  "--sidebar-border": "#e4e4e7",
  "--destructive": "#ef4444",
  "--destructive-foreground": "#ffffff",
  "--warn": "#f59e0b",
  "--warn-surface": "#fffbeb",
  "--success": "#10b981",
  "--success-surface": "#ecfdf5",
  "--danger": "#ef4444",
  "--danger-surface": "#fef2f2",
  "--shadow-sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  "--shadow-md": "0 4px 6px -1px rgb(0 0 0 / 0.1)",
  "--shadow-lg": "0 10px 15px -3px rgb(0 0 0 / 0.1)"
} as const;

/** Tokens del tema oscuro — el tema por defecto del CMS. */
export const DARK_TOKENS = {
  "--background": "#191919",
  "--foreground": "#fafafa",
  "--card": "#171717",
  "--card-foreground": "#fafafa",
  "--popover": "#171717",
  "--popover-foreground": "#fafafa",
  "--primary": "#fafafa",
  "--primary-foreground": "#18181b",
  "--secondary": "#27272a",
  "--secondary-foreground": "#fafafa",
  "--accent": "#27272a",
  "--accent-foreground": "#fafafa",
  "--muted": "#27272a",
  "--muted-foreground": "#a1a1aa",
  "--border": "#27272a",
  "--input": "#27272a",
  "--ring": "#d4d4d8",
  "--sidebar": "#171717",
  "--sidebar-foreground": "#fafafa",
  "--sidebar-primary": "#fafafa",
  "--sidebar-primary-foreground": "#18181b",
  "--sidebar-border": "#27272a",
  "--destructive": "#7f1d1d",
  "--destructive-foreground": "#fafafa",
  "--warn": "#f59e0b",
  "--warn-surface": "#451a0333",
  "--success": "#10b981",
  "--success-surface": "#02251933",
  "--danger": "#ef4444",
  "--danger-surface": "#45050533",
  "--shadow-sm": "0 1px 2px 0 rgb(0 0 0 / 0.4)",
  "--shadow-md": "0 4px 6px -1px rgb(0 0 0 / 0.5)",
  "--shadow-lg": "0 10px 15px -3px rgb(0 0 0 / 0.55)"
} as const;

/** Identidad por defecto de un tenant sin personalizar. */
export const BRAND_TOKENS = {
  "primary": "#111827",
  "secondary": "#6366f1",
  "radius": "0.625rem"
} as const;

export const THEME_MODES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Tema aplicado cuando el usuario no ha elegido ninguno. */
export const DEFAULT_THEME: ThemeMode = "dark";
