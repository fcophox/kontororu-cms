#!/usr/bin/env node
/**
 * Generador de tokens — tokens.yml es la fuente de verdad.
 *
 *   node scripts/generate-tokens.mjs           genera una vez
 *   node scripts/generate-tokens.mjs --watch   regenera al guardar
 *
 * Escribe (no editar a mano, se sobreescriben):
 *   src/styles/tokens.generated.css   variables CSS (:root = dark, .light)
 *   src/lib/tokens.generated.ts       los mismos valores para TypeScript
 *
 * El formato de tokens.yml es plano a propósito (`grupo.nombre.modo: "valor"`),
 * así el parser cabe en 30 líneas y el proyecto no arrastra una dependencia
 * de YAML sólo para leer un archivo de configuración.
 */

import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "tokens.yml");
const CSS_OUT = resolve(ROOT, "src/styles/tokens.generated.css");
const TS_OUT = resolve(ROOT, "src/lib/tokens.generated.ts");

/** Prefijo CSS de cada grupo de `base`. Un grupo desconocido es un error. */
const GROUPS = {
  colors: (name) => `--${name}`,
  fonts: (name) => `--font-${name}-stack`,
  spacing: (name) => `--spacing-${name}`,
  radii: (name) => (name === "base" ? "--radius" : `--radius-${name}`),
  shadows: (name) => `--shadow-${name}`,
  animations: (name) => `--anim-${name}`,
  breakpoints: (name) => `--breakpoint-${name}`,
};

/**
 * Grupos que van a `@theme` en vez de a `:root`. Los breakpoints acaban en
 * media queries, y una media query no puede leer `var()`: Tailwind necesita
 * el valor literal en tiempo de compilación.
 */
const THEME_ONLY = new Set(["breakpoints"]);

// ── Parser ────────────────────────────────────────────────────────────────

/** Lee el YAML plano a `{ bloque: { clave: valor } }`. */
function parseTokens(text) {
  const blocks = {};
  let current = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#")) return;

    const block = line.match(/^([A-Za-z][\w-]*):\s*$/);
    if (block) {
      current = blocks[block[1]] ??= {};
      return;
    }

    const entry = line.match(/^\s+([\w.-]+):\s*"(.*)"\s*$/);
    if (!entry) throw new Error(`tokens.yml:${i + 1} — línea no reconocida: ${raw}`);
    if (!current) throw new Error(`tokens.yml:${i + 1} — token fuera de un bloque`);
    current[entry[1]] = entry[2];
  });

  return blocks;
}

/**
 * Reparte `base` en tres mapas de variables CSS: las compartidas por ambos
 * temas y las propias de cada uno (sufijo `.light` / `.dark`).
 */
function resolveBase(base) {
  const shared = {};
  const light = {};
  const dark = {};
  const theme = {};

  for (const [key, value] of Object.entries(base)) {
    const parts = key.split(".");
    const group = parts.shift();
    const mode = parts.length > 1 && /^(light|dark)$/.test(parts.at(-1)) ? parts.pop() : null;
    const name = parts.join("-");

    const toVar = GROUPS[group];
    if (!toVar) throw new Error(`tokens.yml — grupo desconocido "${group}" en "${key}"`);
    if (!name) throw new Error(`tokens.yml — token sin nombre: "${key}"`);

    const cssVar = toVar(name);
    if (THEME_ONLY.has(group)) theme[cssVar] = value;
    else if (mode === "light") light[cssVar] = value;
    else if (mode === "dark") dark[cssVar] = value;
    else shared[cssVar] = value;
  }

  return { shared, light, dark, theme };
}

// ── Salida ────────────────────────────────────────────────────────────────

const BANNER = `/* Generado por scripts/generate-tokens.mjs desde tokens.yml — NO EDITAR. */`;

function rule(selector, vars) {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

function toCss({ shared, light, dark, theme }, brand) {
  const brandVars = Object.fromEntries(
    Object.entries(brand).map(([k, v]) => [`--brand-${k}`, v]),
  );

  return [
    BANNER,
    "",
    "/* Valores literales: Tailwind los necesita en compilación (media queries). */",
    rule("@theme", theme),
    "",
    "/* Tema por defecto: OSCURO. `.light` en <html> cambia a claro. */",
    rule(":root", { ...shared, ...brandVars, ...dark }),
    "",
    rule(".light", light),
    "",
    "/* Permite anidar un bloque oscuro dentro de una página clara. */",
    rule(".dark", dark),
    "",
  ].join("\n");
}

function toTs({ shared, light, dark, theme }, brand) {
  const literal = (obj) => JSON.stringify(obj, null, 2).replace(/\n/g, "\n");

  return `${BANNER}

/** Tokens presentes en ambos temas (tipografía, radios, espaciado…). */
export const SHARED_TOKENS = ${literal({ ...shared, ...theme })} as const;

/** Tokens del tema claro. */
export const LIGHT_TOKENS = ${literal(light)} as const;

/** Tokens del tema oscuro — el tema por defecto del CMS. */
export const DARK_TOKENS = ${literal(dark)} as const;

/** Identidad por defecto de un tenant sin personalizar. */
export const BRAND_TOKENS = ${literal(brand)} as const;

export const THEME_MODES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Tema aplicado cuando el usuario no ha elegido ninguno. */
export const DEFAULT_THEME: ThemeMode = "dark";
`;
}

// ── Ejecución ─────────────────────────────────────────────────────────────

function generate() {
  const blocks = parseTokens(readFileSync(SOURCE, "utf8"));
  if (!blocks.base) throw new Error("tokens.yml — falta el bloque `base`");
  if (!blocks.brand) throw new Error("tokens.yml — falta el bloque `brand`");

  const base = resolveBase(blocks.base);
  writeFileSync(CSS_OUT, toCss(base, blocks.brand));
  writeFileSync(TS_OUT, toTs(base, blocks.brand));

  const count = Object.keys(blocks.base).length + Object.keys(blocks.brand).length;
  console.log(`tokens · ${count} tokens → tokens.generated.css, tokens.generated.ts`);
}

function run() {
  try {
    generate();
    return true;
  } catch (error) {
    console.error(`tokens · ${error.message}`);
    return false;
  }
}

if (process.argv.includes("--watch")) {
  run();
  console.log("tokens · esperando cambios en tokens.yml…");
  watchFile(SOURCE, { interval: 200 }, run);
} else if (!run()) {
  process.exit(1);
}
