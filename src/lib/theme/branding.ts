import { BRAND_TOKENS } from "@/lib/tokens.generated";
import { isValidHex, shade, accessiblePair } from "./color";

export type TenantBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
  primary: string;
  secondary: string;
  radius: string;
};

/**
 * Los valores salen de `tokens.yml` (bloque `brand`): cambiar la identidad
 * por defecto del CMS es editar el YAML, no tocar este archivo.
 */
export const DEFAULT_BRANDING: TenantBranding = {
  logoUrl: null,
  faviconUrl: null,
  primary: BRAND_TOKENS.primary,
  secondary: BRAND_TOKENS.secondary,
  radius: BRAND_TOKENS.radius,
};

const RADIUS_RE = /^\d+(\.\d+)?(rem|px)$/;

/**
 * Sanea el JSONB `tenants.branding`. Todo lo que venga de la BD es input de
 * usuario: sin esta validación, un valor como `red; } body { display:none`
 * se convertiría en inyección CSS al serializar el <style>.
 */
export function parseBranding(raw: unknown): TenantBranding {
  const b = (raw ?? {}) as Record<string, unknown>;
  return {
    logoUrl: safeUrl(b.logoUrl),
    faviconUrl: safeUrl(b.faviconUrl),
    primary: isValidHex(b.primary) ? normalize(b.primary) : DEFAULT_BRANDING.primary,
    secondary: isValidHex(b.secondary) ? normalize(b.secondary) : DEFAULT_BRANDING.secondary,
    radius:
      typeof b.radius === "string" && RADIUS_RE.test(b.radius)
        ? b.radius
        : DEFAULT_BRANDING.radius,
  };
}

/**
 * Sólo http/https. El logo acaba en el `src` de una <Image> y en el favicon:
 * un `javascript:` guardado en el JSONB sería XSS almacenado, ejecutándose
 * para todos los usuarios del tenant en cada carga del dashboard.
 */
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    // Ruta relativa del propio Storage: se acepta, no puede cambiar de origen.
    return value.startsWith("/") && !value.startsWith("//") ? value : null;
  }
}

function normalize(hex: string): string {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `#${full.toLowerCase()}`;
}

/**
 * Deriva el set completo de CSS variables de Shadcn a partir de dos colores.
 * Sólo se sobreescriben los tokens de marca; el resto del design system
 * (neutrales, tipografía, sombras) lo controla Rukma Studio y no es editable.
 */
export function brandingToCssVars(b: TenantBranding): Record<string, string> {
  // El primario es fondo de texto (botones, badges): se ajusta para cumplir
  // AA. `--brand-primary` conserva el color exacto que eligió el cliente.
  const primary = accessiblePair(b.primary);

  return {
    "--radius": b.radius,

    "--primary": primary.bg,
    "--primary-foreground": primary.fg,
    "--ring": primary.bg,
    "--sidebar-primary": primary.bg,
    "--sidebar-primary-foreground": primary.fg,

    "--secondary": shade(b.secondary, 0.88),
    "--secondary-foreground": shade(b.secondary, -0.45),
    "--accent": shade(b.secondary, 0.9),
    "--accent-foreground": shade(b.secondary, -0.5),

    "--brand-primary": b.primary,
    "--brand-secondary": b.secondary,
  };
}

/** Variante para tema oscuro: los acentos se invierten para no “quemar”. */
export function brandingToCssVarsDark(b: TenantBranding): Record<string, string> {
  const primary = accessiblePair(shade(b.primary, 0.35));

  return {
    "--primary": primary.bg,
    "--primary-foreground": primary.fg,
    "--ring": primary.bg,
    "--secondary": shade(b.secondary, -0.55),
    "--secondary-foreground": shade(b.secondary, 0.85),
    "--accent": shade(b.secondary, -0.6),
    "--accent-foreground": shade(b.secondary, 0.9),
  };
}

export function serializeCssVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
