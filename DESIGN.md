# DESIGN — Master Control

> Fuente de verdad del diseño visual de Kontorōru CMS.
> Los valores editables viven en [`tokens.yml`](tokens.yml).

## Cómo funciona

`tokens.yml` es la fuente de verdad. El generador lo lee y escribe dos
archivos, que **no** se editan a mano:

| Generado | Para qué |
|----------|----------|
| [`src/styles/tokens.generated.css`](src/styles/tokens.generated.css) | Variables CSS (`:root` = oscuro, `.light`, `@theme`), importadas por `globals.css` |
| [`src/lib/tokens.generated.ts`](src/lib/tokens.generated.ts) | Los mismos valores para TypeScript (`DARK_TOKENS`, `LIGHT_TOKENS`, `BRAND_TOKENS`) |

```bash
npm run tokens
```

```bash
npm run tokens:watch
```

`npm run dev` y `npm run build` ejecutan el generador antes de arrancar, así
que un `tokens.yml` recién editado nunca queda desincronizado. Los archivos
generados **se commitean**: el build de Railway no necesita nada extra.

### La cadena completa

```
tokens.yml
   ├─→ tokens.generated.css ─→ globals.css ─→ @theme inline ─→ utilidades Tailwind
   │        (:root / .light)                                    (bg-background, text-muted-foreground…)
   └─→ tokens.generated.ts  ─→ DEFAULT_BRANDING ─→ <TenantTheme> ─→ overrides por tenant
```

Cambiar `colors.background.dark` en el YAML repinta el CMS entero: no hay un
solo hex hardcodeado en `globals.css` ni en los componentes.

---

## Temas: oscuro por defecto, claro opcional

El CMS es **oscuro por defecto**. Un sufijo `.dark` / `.light` en `tokens.yml`
reparte el valor entre los dos temas; sin sufijo aplica a ambos.

| Selector | Contiene |
|---|---|
| `:root` | Tokens compartidos + **todos los valores oscuros** |
| `.light` | Sólo los overrides del tema claro |
| `.dark` | Los mismos valores oscuros, para anidar un bloque oscuro dentro de una página clara |

Poner el tema oscuro en `:root` es lo que hace que sea el defecto real: si el
CSS del tema claro nunca llega, la interfaz sigue siendo la correcta.

**Cómo se aplica.** `<html>` se renderiza en el servidor con la clase del tema
por defecto ([`layout.tsx`](src/app/layout.tsx)). Antes del primer paint,
[`<ThemeScript>`](src/components/theme-script.tsx) —un script inline y
bloqueante— lee `localStorage["kntr-theme"]` y corrige la clase si el usuario
eligió el otro tema. Sin ese script habría un flash de tema equivocado en cada
carga para los usuarios de tema claro.

Las dos clases son excluyentes: `.dark` la necesitan las variantes `dark:` de
Tailwind, `.light` activa el bloque de overrides. Ambas las gestiona
`applyTheme()` en [`src/lib/theme/mode.ts`](src/lib/theme/mode.ts).

Para dar al usuario el conmutador, monta
[`<ThemeToggle />`](src/components/theme-toggle.tsx) donde corresponda (barra
superior del dashboard, menú de perfil).

---

## Tokens base — Chrome del CMS

Colores del workspace donde el editor escribe: superficies, texto, bordes,
sidebar. El nombre CSS se deriva del grupo en `tokens.yml`:

| Grupo | Prefijo CSS | Ejemplo |
|---|---|---|
| Colores | `--<nombre>` | `--background`, `--muted-foreground` |
| Tipografía | `--font-*-stack` | `--font-sans-stack` |
| Espaciado | `--spacing-*` | `--spacing-md` |
| Radio base | `--radius` | `--radius` (sm/md/lg/xl se derivan en `globals.css`) |
| Sombras | `--shadow-*` | `--shadow-md` |
| Animaciones | `--anim-*` | `--anim-normal` |
| Breakpoints | `--breakpoint-*` | `--breakpoint-lg` |

> **Los breakpoints son especiales.** Acaban en media queries, y una media
> query no puede leer `var()`. El generador los emite como valores literales
> dentro de `@theme`, no en `:root`, que es lo que permite que `lg:` en
> Tailwind responda a lo que dice el YAML.

`--font-sans-stack` referencia `--font-inter`, que inyecta `next/font` en el
layout raíz. Si cambias esa variable en `layout.tsx`, cámbiala también en
`fonts.sans`.

### Estados semánticos

`warn`, `success` y `danger` (más su `-surface`) existen para los callouts del
editor Tiptap y los badges de estado. Cada uno tiene un color de acento y una
superficie de fondo por tema. `destructive` es el rojo de acciones peligrosas
del design system de Shadcn y es distinto de `danger`, que es contenido.

---

## Brand — identidad por tenant

El bloque `brand` de `tokens.yml` define lo que ve un tenant que **todavía no
ha personalizado nada**. Se consume desde TypeScript como `BRAND_TOKENS` y
alimenta `DEFAULT_BRANDING` en
[`src/lib/theme/branding.ts`](src/lib/theme/branding.ts).

Un tenant sólo puede sobreescribir **tres** valores: `primary`, `secondary` y
`radius`. En runtime, [`<TenantTheme>`](src/components/tenant-theme.tsx)
serializa un `<style>` scopeado por id que redefine los tokens de marca:

| Token | Origen |
|---|---|
| `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary` | Derivados de `primary` con `accessiblePair()` (garantiza AA 4.5:1) |
| `--secondary`, `--accent` y sus `-foreground` | Derivados de `secondary` con `shade()` |
| `--radius` | Directo |
| `--brand-primary`, `--brand-secondary` | El color **exacto** del cliente, sin ajuste de contraste |

Todo lo demás —neutrales, superficies, tipografía, sombras, espaciado— es
territorio de Rukma Studio y no es personalizable. Es lo que permite desplegar
un rediseño a todos los clientes a la vez sin romperle la interfaz a nadie.

---

## Reglas de uso

1. **Ningún hex en componentes.** Usa las utilidades de Tailwind
   (`bg-card`, `text-muted-foreground`, `border-border`) o `var(--token)`.
   Si necesitas un color que no existe, añádelo a `tokens.yml`.
2. **Ninguna clase de color de Tailwind por defecto** (`bg-zinc-800`,
   `text-amber-500`) en el chrome del CMS: no reaccionan al tema ni al tenant.
3. **Nunca edites los `.generated.*`.** El siguiente `npm run dev` los pisa.
4. **Un token nuevo con variante por tema necesita las dos**, `.light` y
   `.dark`. El generador no inventa el que falte.
5. **Colores nuevos de UI: cablearlos en `@theme inline`** de
   [`globals.css`](src/styles/globals.css) como `--color-<nombre>` si quieres
   la utilidad de Tailwind (`bg-<nombre>`).

### Añadir un token, de principio a fin

```yaml
# tokens.yml
base:
  colors.info.dark: "#38bdf8"
  colors.info.light: "#0284c7"
```

```css
/* src/styles/globals.css — dentro de @theme inline */
--color-info: var(--info);
```

```bash
npm run tokens
```

Ya puedes usar `bg-info` / `text-info` en cualquier componente, y responde al
tema solo.

---

## Resumen de contextos

| Contexto | Tokens principales | Notas |
|---|---|---|
| **Chrome del CMS** | `background`, `foreground`, `card`, `muted`, `border`, `sidebar-*` | Core del tema, oscuro por defecto |
| **Acentos de marca** | `primary`, `secondary`, `accent`, `ring`, `radius` | Los sobreescribe `<TenantTheme>` por tenant |
| **Estados** | `destructive`, `warn`, `success`, `danger` (+ `-surface`) | Badges y callouts del editor |
| **Identidad exacta** | `brand-primary`, `brand-secondary` | El hex del cliente sin ajuste de contraste |
| **Escalas** | `spacing-*`, `radius-*`, `shadow-*`, `anim-*`, `breakpoint-*` | Compartidas salvo las sombras, que sí varían por tema |
