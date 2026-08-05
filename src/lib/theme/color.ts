/**
 * Utilidades de color para el theming dinámico por tenant.
 * Sin dependencias: se ejecuta en el Server Component de layout,
 * por lo que no puede añadir peso al bundle del cliente.
 */

export type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#?([a-f\d]{3}|[a-f\d]{6})$/i;

export function isValidHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Luminancia relativa WCAG. */
export function luminance({ r, g, b }: Rgb): number {
  const ch = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Elige blanco o negro como color de texto sobre `bg`, maximizando contraste.
 * Garantiza legibilidad aunque el cliente suba una marca amarillo flúor.
 */
export function readableForeground(bg: Rgb): string {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 10, g: 10, b: 10 };
  return contrastRatio(bg, white) >= contrastRatio(bg, black) ? "#ffffff" : "#0a0a0a";
}

/**
 * Devuelve un par fondo/texto que cumple el ratio mínimo (AA = 4.5:1).
 *
 * `readableForeground` elige el mejor de blanco y negro, pero con marcas de
 * tono medio —un índigo #6366f1, por ejemplo— NINGUNO de los dos llega a 4.5.
 * En ese caso se empuja el FONDO en dirección contraria al texto hasta que
 * pasa: unos puntos de luminosidad son imperceptibles como identidad de marca
 * y son la diferencia entre un botón legible y uno que no lo es.
 *
 * El color exacto del cliente se conserva en `--brand-primary`, que no se
 * usa como fondo de texto.
 */
export function accessiblePair(hex: string, minRatio = 4.5): { bg: string; fg: string } {
  const fg = readableForeground(hexToRgb(hex));
  if (contrastRatio(hexToRgb(hex), hexToRgb(fg)) >= minRatio) return { bg: hex, fg };

  // Texto blanco → hay que oscurecer el fondo, y viceversa.
  const direction = fg === "#ffffff" ? -1 : 1;

  for (let step = 0.02; step <= 1; step += 0.02) {
    const candidate = shade(hex, direction * step);
    if (contrastRatio(hexToRgb(candidate), hexToRgb(fg)) >= minRatio) {
      return { bg: candidate, fg };
    }
  }
  return { bg: direction < 0 ? "#000000" : "#ffffff", fg };
}

/** Mezcla lineal hacia blanco (amount > 0) o negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex({
    r: r + (target - r) * t,
    g: g + (target - g) * t,
    b: b + (target - b) * t,
  });
}

/** Convierte a `r g b` para usar con `color-mix` / opacidad en Tailwind. */
export function hexToChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}
