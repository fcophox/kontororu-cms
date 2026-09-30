import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  FileText,
  Globe,
  History,
  ImageIcon,
  KeyRound,
  Palette,
  ShieldCheck,
  Webhook,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADDONS } from "@/lib/addons/catalog";
import { getCurrentUser } from "@/lib/auth/tenant-context";
import { resolveLandingPath } from "@/lib/auth/landing";

import { CLIENTS, TESTIMONIAL, type Client } from "./_data/clients";
import { ApiDemo, EditorDemo, LocalesDemo } from "./_components/step-demos";
import { PanelMock } from "./_components/panel-mock";
import { TiltCard } from "./_components/tilt-card";
import { GradualBlur } from "./_components/gradual-blur";
import { Reveal } from "./_components/reveal";
import { SiteHeader } from "./_components/site-header";

/*
 * El array se arma AQUÍ y no se exporta desde step-demos.tsx.
 * Ese módulo es "use client": de un módulo cliente el servidor recibe
 * referencias opacas, así que un array exportado desde allí no es un array
 * al llegar y `STEP_DEMOS[i]` sale `undefined`. Las importaciones con
 * nombre sí son referencias de componente válidas.
 */
const STEP_DEMOS = [EditorDemo, LocalesDemo, ApiDemo];

export const metadata: Metadata = {
  title: "Kontorōru · El CMS de tu web, bajo control",
  description:
    "CMS headless multi-tenant de Rukma Studio. Publica desde un panel con tu marca y tu web recibe el contenido por API en cuanto cambia.",
};

/** Cifras que salen de cómo está construido el producto, no de marketing. */
const PROOF = [
  { value: "96", label: "pruebas de aislamiento", note: "bloquean el despliegue si fallan" },
  { value: "30", label: "versiones de historial", note: "restaurar no destruye nada" },
  { value: "6", label: "reintentos por webhook", note: "1, 2, 4, 8, 16 y 32 minutos" },
  { value: "5", label: "roles de permisos", note: "de propietario a colaborador" },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Cada cliente, en su propio mundo",
    body: "El aislamiento no es una condición en el código: lo impone Postgres con Row Level Security forzada. Contenido, archivos, usuarios y claves pertenecen a un espacio y no se cruzan con otro nunca.",
  },
  {
    icon: Palette,
    title: "Tu marca, no la nuestra",
    body: "Logotipo, color principal, color secundario y forma de las esquinas. Los cambios se ven mientras mueves el selector. Si tu color queda con poco contraste, ajustamos el tono sólo sobre los botones para que el texto siga leyéndose — tu color exacto se conserva.",
  },
  {
    icon: Globe,
    title: "Multi-idioma de verdad",
    body: "Cada idioma es un contenido completo, con su URL, su SEO y su estado. El inglés puede seguir en borrador mientras el español lleva un mes publicado. La API sirve el idioma principal cuando no le piden ninguno.",
  },
  {
    icon: FileText,
    title: "Un editor que no estorba",
    body: "Títulos, listas, citas, código, destacados, vídeos e imágenes que se arrastran. Extracto, categoría, URL editable y campos personalizados para lo que el CMS no contempla, sin pedir un cambio de programa.",
  },
  {
    icon: KeyRound,
    title: "API headless y SDK tipado",
    body: "Entradas, categorías, medios y complementos por HTTP con tu clave. El espacio se deduce de la clave: no hay parámetro que equivocarse. Y el cliente oficial trae la verificación de firma ya resuelta.",
  },
  {
    icon: Webhook,
    title: "Avisos que no se pierden",
    body: "Cuando publicas, tu web se entera. Si tu servidor está caído, el aviso se reintenta solo con espera creciente, y el registro de envíos dice exactamente qué pasó en cada intento.",
  },
  {
    icon: ImageIcon,
    title: "Medios con cuota y texto alternativo",
    body: "Biblioteca por espacio, con dimensiones y límite por plan. El texto alternativo viaja en la API junto a la imagen: la accesibilidad de tu web empieza aquí.",
  },
  {
    icon: History,
    title: "Nada se pierde por error",
    body: "Papelera con restauración, archivado para retirar sin borrar e historial de versiones con quién guardó qué. El borrado definitivo pide escribir el título — es la única acción sin vuelta atrás.",
  },
];

const BENEFITS = [
  {
    title: "Publicar deja de pasar por desarrollo",
    body: "Escribir una entrada y verla en la web no requiere un despliegue, ni una rama, ni esperar a nadie. Quien redacta, publica.",
  },
  {
    title: "La web se actualiza sola",
    body: "El webhook avisa en el momento del cambio. Sin él, un horario corregido tarda hasta medio minuto en aparecer; con él, lo hace al instante.",
  },
  {
    title: "Nadie ve lo que no es suyo",
    body: "Un cliente no sabe que existen los demás. Y dentro de su espacio, cada rol ve exactamente lo que le toca.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Escribes en tu panel",
    body: "Con tu logotipo y tus colores. Guardar y publicar son dos pasos distintos a propósito: un borrador nunca se escapa a la web.",
  },
  {
    n: "02",
    title: "Publicas el idioma que quieras",
    body: "Cada traducción lleva su propio estado y su propia URL. Lo que no está publicado, simplemente no existe para fuera.",
  },
  {
    n: "03",
    title: "Tu web lo recibe",
    body: "Un webhook firmado avisa del cambio y tu web pide el contenido por la API con su clave. Sin plugins, sin plantillas, sin base de datos compartida.",
  },
];

/**
 * Una celda del muro de logotipos.
 *
 * `unoptimized` porque son SVG: el optimizador de Next no los toca sin
 * `dangerouslyAllowSVG`, y activar esa bandera para tres archivos nuestros
 * abriría la puerta a servir SVG de terceros con scripts dentro.
 *
 * El logotipo se enciende al pasar por encima. La variante `hover:` de
 * Tailwind v4 ya viaja dentro de `@media (hover: hover)`, así que en pantalla
 * táctil no hay un estado encendido que se quede pegado tras el toque. Por eso
 * el estado de reposo es 80% y no 40%: en móvil ése es el único estado que
 * existe, y un logotipo de cliente no puede verse a medio apagar.
 */
function LogoCell({ client }: { client: Client }) {
  const logo = (
    <Image
      src={client.logo}
      alt={client.name}
      width={client.width}
      height={client.height}
      unoptimized
      style={{ height: client.displayHeight, width: "auto" }}
      className="max-w-full opacity-80 transition-opacity duration-200 ease-out group-hover:opacity-100"
    />
  );

  return (
    <div className="group flex flex-col items-center justify-center gap-2 text-center">
      {client.href ? (
        <a
          href={client.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${client.name} — abre su web`}
          className="flex items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {logo}
        </a>
      ) : (
        logo
      )}
      {client.usage && (
        <p className="text-xs leading-relaxed text-muted-foreground">{client.usage}</p>
      )}
    </div>
  );
}

export default async function LandingPage() {
  // La portada es pública. Si además hay sesión, el botón deja de invitar a
  // entrar y lleva directamente a donde esa persona trabaja.
  const user = await getCurrentUser();
  const dashboardPath = user ? await resolveLandingPath(user.id) : null;

  return (
    <div className="min-h-svh">
      <SiteHeader dashboardPath={dashboardPath} />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b">
          {/* Halo de marca. `pointer-events-none` porque no es un elemento:
              es atmósfera, y no debe robar clics al contenido. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-[28rem] h-[64rem] opacity-30"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 40%, var(--brand-secondary) 0%, transparent 90%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="animate-rise-in-blur inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--brand-secondary)" }}
                />
                CMS headless multi-tenant · Rukma Studio
              </p>

              <h1
                className="animate-rise-in-blur mt-6 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl"
                style={{ animationDelay: "60ms" }}
              >
                El contenido de tu web,{" "}
                <span className="text-muted-foreground">bajo control.</span>
              </h1>

              <p
                className="animate-rise-in-blur mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty"
                style={{ animationDelay: "120ms" }}
              >
                Kontorōru separa lo que escribes de dónde se ve. Tú publicas desde un panel con
                tu marca; tu web recibe el contenido por API en el momento exacto en que cambia.
              </p>

              <div
                className="animate-rise-in mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
                style={{ animationDelay: "180ms" }}
              >
                <Button
                  asChild
                  size="lg"
                  className="w-full transition-transform active:scale-[0.97] sm:w-auto"
                >
                  <Link href={dashboardPath ?? "/login"}>
                    {dashboardPath ? "Ir a mi panel" : "Acceder al panel"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full transition-transform active:scale-[0.97] sm:w-auto"
                >
                  <a href="#como-funciona">Ver cómo funciona</a>
                </Button>
              </div>

              <p
                className="animate-rise-in mt-5 text-xs text-muted-foreground"
                style={{ animationDelay: "240ms" }}
              >
                El alta de cuentas la gestiona Rukma Studio por invitación.
              </p>
            </div>

            <div className="animate-rise-in mt-16" style={{ animationDelay: "300ms" }}>
              {/* Menos grados que las demos: es casi el doble de ancha, y el
                  mismo ángulo recorre el doble de píxeles en las esquinas. */}
              <TiltCard tilt={7}>
                <PanelMock />
              </TiltCard>
            </div>
          </div>
        </section>

        {/* ── Cifras ───────────────────────────────────────────── */}
        <section className="border-b">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border px-6 sm:grid-cols-4 sm:px-0">
            {PROOF.map((item, i) => (
              <Reveal key={item.label} delay={i * 60} blur className="bg-background">
                <div className="px-6 py-8">
                  <p className="text-3xl font-bold tracking-tight">{item.value}</p>
                  <p className="mt-1 text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Beneficios ───────────────────────────────────────── */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <Reveal blur>
              <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Lo que cambia el día que lo conectas
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {BENEFITS.map((benefit, i) => (
                <Reveal key={benefit.title} delay={i * 60}>
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {benefit.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Cómo funciona ────────────────────────────────────── */}
        <section id="como-funciona" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <Reveal blur>
              <p className="text-sm font-medium" style={{ color: "var(--brand-secondary)" }}>
                Cómo funciona
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Tres pasos, y ninguno pasa por un desarrollador
              </h2>
            </Reveal>

            {/* Cada paso con su demo al lado. El texto siempre a la izquierda
                y la demo a la derecha, sin alternar: los pasos van numerados
                y una lectura en zigzag pelea con el orden que anuncian. */}
            <ol className="mt-14 space-y-16 sm:space-y-20">
              {STEPS.map((step, i) => {
                const Demo = STEP_DEMOS[i];
                return (
                  <li
                    key={step.n}
                    className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12"
                  >
                    <Reveal blur>
                      <div className="flex gap-5">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border font-mono text-xs text-muted-foreground">
                          {step.n}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold">{step.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {step.body}
                          </p>
                        </div>
                      </div>
                    </Reveal>

                    {/* La demo va DENTRO del Reveal: su `data-shown` es lo
                        que suelta el freno de las animaciones de dentro. El
                        margen del 25% la retiene hasta que está en pantalla
                        de verdad — dura tres segundos y arrancarla en cuanto
                        asoma es regalársela a quien pasa de largo. */}
                    <Reveal delay={80} margin="0px 0px -25% 0px" className="min-w-0">
                      <TiltCard>
                        <Demo />
                      </TiltCard>
                    </Reveal>
                  </li>
                );
              })}
            </ol>

            <Reveal delay={80} className="mt-10">
              {/* En escritorio cabe en una línea; `text-balance` es para los
                  anchos donde parte, que es donde una línea larga seguida de
                  tres palabras sueltas y centradas se lee como un descuido. */}
              <p className="mx-auto max-w-2xl text-center text-sm text-balance text-muted-foreground">
                {/* En línea y no en un flex al lado: el párrafo está centrado
                    y puede partir en varias líneas; como caja flex, el icono
                    se quedaría pegado al borde de un bloque de texto que ya
                    no está alineado con él. Así viaja con la primera línea y
                    se centra con ella. */}
                <KeyRound aria-hidden className="mr-1.5 inline size-4 align-[-0.15em]" />
                La clave vive en tu servidor y decide de qué espacio lee. No hay parámetro de
                cliente que equivocarse.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Atributos ────────────────────────────────────────── */}
        <section id="producto" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <Reveal blur>
              <p className="text-sm font-medium" style={{ color: "var(--brand-secondary)" }}>
                Producto
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Todo lo que un CMS debería dar por hecho
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, i) => (
                <Reveal
                  key={feature.title}
                  delay={(i % 4) * 60}
                  className="bg-card transition-colors duration-200 hover:bg-accent/40"
                >
                  <div className="h-full p-6">
                    <feature.icon className="size-5 text-muted-foreground" />
                    <h3 className="mt-4 font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {feature.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Complementos ─────────────────────────────────────── */}
        <section id="complementos" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <Reveal blur>
              <p className="text-sm font-medium" style={{ color: "var(--brand-secondary)" }}>
                Complementos
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Lo que tu web necesita, sin encargar un desarrollo
              </h2>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                Se activan desde el panel y quedan accesibles por la misma API. Todos están
                incluidos.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {ADDONS.map((addon, i) => (
                <Reveal key={addon.key} delay={(i % 2) * 60}>
                  <div className="h-full rounded-xl border bg-card p-6">
                    <div className="flex items-start justify-between gap-4">
                      <addon.icon className="size-5 text-muted-foreground" />
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {addon.priceLabel}
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold">{addon.name}</h3>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">
                      {addon.summary}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {addon.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Clientes ─────────────────────────────────────────── */}
        <section id="clientes" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <Reveal blur>
              <p className="text-sm font-medium" style={{ color: "var(--brand-secondary)" }}>
                Clientes
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Quién publica ya con Kontorōru
              </h2>
            </Reveal>

            {/* Muro de logotipos, sin tarjeta que los encierre: las marcas
                se apoyan en el fondo de la sección.

                Una fila que fluye, no una rejilla: con rejilla, un número de
                clientes que no llena la última fila deja celdas vacías a la
                vista, y la lista crece cada vez que entra uno nuevo.

                `justify-between` sólo desde `lg`, que es donde los cinco
                caben en una línea y repartirlos los lleva de borde a borde.
                Por debajo la fila se parte, y ahí `between` empujaría los
                huérfanos de la última contra los extremos en vez de
                centrarlos. */}
            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-10 sm:gap-x-14 lg:justify-between">
              {CLIENTS.map((client, i) => (
                // Cascada de izquierda a derecha: 40ms por logotipo son
                // 160ms de punta a punta, que se lee como un gesto y no
                // como cinco entradas sueltas.
                <Reveal key={client.name} delay={i * 40}>
                  <LogoCell client={client} />
                </Reveal>
              ))}
            </div>

            {/* La cita, sin tarjeta ni filete: sólo texto centrado sobre el
                fondo, igual que el muro de logotipos de arriba.

                `max-w-3xl` porque el ancho de la sección es el de un titular,
                no el de un párrafo: una cita centrada a 1100px deja renglones
                que hay que rastrear con el dedo para volver al principio.

                `text-balance` y no `text-pretty`: en un bloque corto y
                centrado lo que molesta no es la viuda del final, es que unas
                líneas midan el triple que otras. */}
            <Reveal delay={120} blur className="mt-20">
              <figure className="mx-auto max-w-3xl text-center">
                <blockquote className="text-xl leading-snug font-medium text-balance sm:text-2xl">
                  «{TESTIMONIAL.text}»
                </blockquote>
                <figcaption className="mt-6 flex items-center justify-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-bold">
                    {TESTIMONIAL.author.charAt(0)}
                  </span>
                  {/* A la izquierda entre ellas, no centradas: el nombre y el
                      cargo son un bloque que se apoya en la inicial. */}
                  <span className="flex flex-col text-left">
                    <span className="text-sm font-semibold">{TESTIMONIAL.author}</span>
                    <span className="text-xs text-muted-foreground">{TESTIMONIAL.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ── Cierre ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-[28rem] h-[64rem] opacity-30"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 60%, var(--brand-secondary) 0%, transparent 90%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
            <Reveal blur>
              <Image
                src="/brand/kontororu-isotipo.svg"
                alt=""
                width={733}
                height={733}
                unoptimized
                className="mx-auto mb-6 size-16"
              />
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Tu espacio ya te está esperando
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground text-pretty">
                Si Rukma Studio ya te dio de alta, entra y empieza a publicar. Si todavía no,
                escríbenos y montamos tu espacio con tu marca.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="w-full transition-transform active:scale-[0.97] sm:w-auto"
                >
                  <Link href={dashboardPath ?? "/login"}>
                    {dashboardPath ? "Ir a mi panel" : "Acceder"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full transition-transform active:scale-[0.97] sm:w-auto"
                >
                  <a href="https://rukma.studio" target="_blank" rel="noreferrer noopener">
                    Hablar con Rukma Studio
                  </a>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm">
            <Image
              src="/brand/kontororu-isotipo.svg"
              alt=""
              width={733}
              height={733}
              unoptimized
              className="size-5"
            />
            <span className="font-semibold">Kontorōru</span>
            <span className="text-muted-foreground">· un producto de Rukma Studio</span>
          </div>
          {/* Parte en dos líneas en móvil: con los enlaces legales ya no cabe
              en 375px, y sin `flex-wrap` se salía por los dos lados. */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link href="/login" className="transition-colors duration-150 hover:text-foreground">
              Acceder
            </Link>
            <Link
              href="/legal/privacidad"
              className="transition-colors duration-150 hover:text-foreground"
            >
              Privacidad
            </Link>
            <Link
              href="/legal/cookies"
              className="transition-colors duration-150 hover:text-foreground"
            >
              Cookies
            </Link>
            <a
              href="https://rukma.studio"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors duration-150 hover:text-foreground"
            >
              Rukma Studio
            </a>
          </div>
        </div>
      </footer>

      <GradualBlur />
    </div>
  );
}
