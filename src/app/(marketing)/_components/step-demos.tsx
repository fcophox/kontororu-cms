"use client";

import { useEffect, useState } from "react";
import { Check, Globe, Radio, Save, Send } from "lucide-react";

import { useDemoLoop, useInView } from "./use-demo-loop";

/**
 * Las tres demos de «Cómo funciona».
 *
 * Las animaciones son CSS —corren fuera del hilo principal y no pierden
 * fotogramas mientras la página termina de cargar—. El JS de aquí no anima
 * nada: sólo decide CUÁNDO. Tres decisiones, en realidad:
 *
 *   · si la demo está en pantalla (fuera, se congela),
 *   · cuándo empieza otra vuelta,
 *   · y en la 2, si manda el bucle o manda quien ha pinchado.
 *
 * Los retrasos van en línea a propósito: el guion de cada demo se lee de
 * arriba abajo aquí, junto al elemento que le toca, y no repartido entre
 * una docena de clases en la hoja de estilos. Los gestos —escribir, entrar,
 * relevarse, dibujar— viven en globals.css y se reutilizan.
 */

/** Un ciclo completo de cada demo, incluido el rato quieta en el resultado. */
const EDITOR_PERIOD = 6500;
const API_PERIOD = 5500;
/** Lo que dura cada idioma antes de pasar al siguiente, mientras nadie toque. */
const LOCALE_PERIOD = 2600;

function Frame({
  label,
  badge,
  playing,
  frameRef,
  decorative = true,
  children,
}: {
  label: string;
  badge?: string;
  playing: boolean;
  frameRef?: React.Ref<HTMLDivElement>;
  /** La 2 no lo es: tiene botones de verdad y se anuncia como tal. */
  decorative?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={frameRef}
      data-playing={playing || undefined}
      aria-hidden={decorative || undefined}
      /*
       * 16:9 desde `sm`, y alto natural por debajo.
       *
       * La maqueta del hero sí aguanta 4:3 en móvil porque lo que le sobra
       * es una lista, y una lista recortada sigue leyéndose como una lista.
       * Aquí no hay nada prescindible: a 327px de ancho estas tres piden
       * entre 285 y 309px de alto, y cualquier proporción apaisada se come
       * la barra de Guardar, la fila de Estado o la línea de código. Antes
       * que recortar lo que la demo venía a enseñar, en móvil crecen.
       *
       * De la proporción sale el reparto de dentro: la barra de ventana
       * mide lo que mide y el cuerpo se queda con el resto. El `min-h-0`
       * del cuerpo es lo que le permite encoger por debajo de su contenido
       * en vez de desbordar el marco.
       */
      className="demo flex aspect-auto flex-col overflow-hidden rounded-xl border bg-card shadow-lg sm:aspect-video"
    >
      <div className="flex shrink-0 items-center gap-2 border-b bg-background/60 px-4 py-2.5">
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">{label}</span>
        {badge && (
          <span className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Una línea que se teclea. El cursor se queda al final, no viaja con ella. */
function Typed({
  children,
  delay,
  duration = 700,
  className = "",
}: {
  children: React.ReactNode;
  delay: number;
  duration?: number;
  className?: string;
}) {
  return (
    <span
      className={`animate-demo-type inline-block ${className}`}
      style={{ animationDelay: `${delay}ms`, animationDuration: `${duration}ms` }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   1 · Escribes en tu panel
   Se escribe el título, se escribe el cuerpo, aparecen los campos
   de la barra lateral y se pulsa Guardar. Termina en BORRADOR:
   publicar es el paso 2, y ésa es justo la frase de al lado.
   ───────────────────────────────────────────────────────────── */
export function EditorDemo() {
  const { ref, cycle, playing } = useDemoLoop<HTMLDivElement>(EDITOR_PERIOD);

  return (
    <Frame label="tu-estudio/content/nueva" badge="Editor" playing={playing} frameRef={ref}>
      <div
        key={cycle}
        className="animate-demo-cycle flex min-h-0 flex-1"
        style={{ animationDuration: `${EDITOR_PERIOD}ms` }}
      >
        <div className="flex min-w-0 flex-1 flex-col p-5">
          <h4 className="text-base leading-snug font-semibold">
            <Typed delay={150} duration={800}>
              Cómo elegimos la paleta de un proyecto
            </Typed>
          </h4>

          {/* `flex-1`: el hueco que sobra queda debajo del texto, que es
              donde está el hueco en un editor de verdad. Y de paso empuja
              la barra de Guardar contra el borde inferior. */}
          <div className="mt-3 flex-1 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <Typed delay={950} duration={600}>
                La paleta no se elige por gusto: se elige por
              </Typed>
            </p>
            <p>
              <Typed delay={1500} duration={600}>
                contraste, jerarquía y lo que la marca ya es. Antes de abrir
              </Typed>
            </p>
            <p className="flex items-center gap-0.5">
              <Typed delay={2050} duration={600}>
                el selector, hay tres preguntas que conviene responder.
              </Typed>
              <span
                className="animate-demo-caret inline-block h-3.5 w-px bg-foreground"
                style={{ animationDelay: "2650ms" }}
              />
            </p>
          </div>

          <div className="mt-4 flex shrink-0 items-center gap-2 border-t pt-4">
            <span
              className="animate-demo-press inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
              style={{ animationDelay: "3250ms" }}
            >
              <Save className="size-3" />
              Guardar
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] text-muted-foreground">
              <Send className="size-3" />
              Publicar
            </span>
          </div>
        </div>

        <aside className="hidden w-40 shrink-0 space-y-3 border-l bg-sidebar p-4 sm:block">
          <div className="animate-demo-pop" style={{ animationDelay: "2700ms" }}>
            <p className="text-[10px] text-muted-foreground">Categoría</p>
            <p className="mt-1 truncate rounded border px-1.5 py-1 text-[11px]">Casos de estudio</p>
          </div>
          <div className="animate-demo-pop" style={{ animationDelay: "2830ms" }}>
            <p className="text-[10px] text-muted-foreground">Extracto</p>
            <p className="mt-1 rounded border px-1.5 py-1 text-[11px] text-muted-foreground">
              Por qué el contraste…
            </p>
          </div>
          <div className="animate-demo-pop" style={{ animationDelay: "2970ms" }}>
            <p className="text-[10px] text-muted-foreground">Estado</p>
            <p className="mt-1 rounded bg-amber-950 px-1.5 py-1 text-[11px] font-medium text-amber-300">
              Borrador
            </p>
          </div>
        </aside>
      </div>
    </Frame>
  );
}

/* ─────────────────────────────────────────────────────────────
   2 · Publicas el idioma que quieras
   La única que se toca. Va sola pasando de idioma hasta que
   alguien elige uno; a partir de ahí manda esa persona y el
   bucle no vuelve. Un carrusel que te devuelve a su sitio dos
   segundos después de que hayas pinchado no es una demo: es una
   interfaz peleándose con quien la usa.
   ───────────────────────────────────────────────────────────── */
const LOCALES = [
  {
    code: "ES",
    title: "Sobre nosotros",
    name: "Español",
    dot: "bg-emerald-400",
    url: "/es/sobre-nosotros",
    text: "Diseñamos webs que se mantienen solas.",
    status: "Publicado · hace 1 mes",
    statusClass: "bg-emerald-950 text-emerald-300",
  },
  {
    code: "EN",
    title: "About us",
    name: "English",
    dot: "bg-amber-400",
    url: "/en/about-us",
    text: "We design websites that maintain themselves.",
    status: "Borrador",
    statusClass: "bg-amber-950 text-amber-300",
  },
  {
    code: "PT",
    title: "Sobre nós",
    name: "Português",
    dot: "bg-emerald-400",
    url: "/pt/sobre-nos",
    text: "Criamos sites que se mantêm sozinhos.",
    status: "Publicado · hace 3 días",
    statusClass: "bg-emerald-950 text-emerald-300",
  },
];

export function LocalesDemo() {
  const { ref, inView, reduced } = useInView<HTMLDivElement>();
  const [auto, setAuto] = useState(0);
  /** En cuanto tiene valor, el bucle se acabó para siempre. */
  const [pinned, setPinned] = useState<number | null>(null);
  const active = pinned ?? auto;
  const looping = inView && !reduced && pinned === null;

  useEffect(() => {
    if (!looping) return;
    const id = setInterval(() => setAuto((i) => (i + 1) % LOCALES.length), LOCALE_PERIOD);
    return () => clearInterval(id);
  }, [looping]);

  return (
    <Frame
      label="tu-estudio/content/sobre-nosotros"
      badge="Idiomas"
      playing={looping}
      frameRef={ref}
      decorative={false}
    >
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div
          role="group"
          aria-label="Vista previa: el mismo contenido en tres idiomas"
          className="relative grid shrink-0 grid-cols-3 rounded-lg border p-1"
        >
          {/* El indicador viaja por debajo; los botones van encima. */}
          <span
            aria-hidden
            className="demo-tab-indicator absolute inset-y-1 left-1 rounded-md bg-accent"
            style={{
              width: "calc((100% - 0.5rem) / 3)",
              transform: `translateX(${active * 100}%)`,
            }}
          />
          {LOCALES.map((locale, i) => (
            <button
              key={locale.code}
              type="button"
              aria-pressed={i === active}
              // También al enfocar con teclado: si el bucle siguiera, la
              // pestaña elegida se movería sola bajo el foco.
              onFocus={() => setPinned((p) => p ?? i)}
              onClick={() => setPinned(i)}
              // El `before` estira el área de toque hasta ~44px sin tocar el
              // tamaño visual: la maqueta es una miniatura del CMS y agrandar
              // la pestaña de verdad la convertiría en otra cosa. Un botón de
              // 22px es cómodo con ratón y una lotería con el pulgar.
              className="relative z-10 flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-medium transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span aria-hidden className={`size-1.5 rounded-full ${locale.dot}`} />
              <span aria-hidden>{locale.code}</span>
              <span className="sr-only">{locale.name}</span>
            </button>
          ))}
        </div>

        {/* Los tres datos que cambian con el idioma. Las tres versiones se
            apilan en la misma celda de rejilla y sólo se enciende una: sin
            reemplazar nada, la tarjeta no pega un salto al cambiar. */}
        {/* `justify-between` reparte los campos por el alto del marco. Con
            `space-y` se quedaban apelotonados arriba y el 16:9 se notaba
            como un hueco, no como una pantalla. */}
        <dl className="mt-5 flex flex-1 flex-col justify-between gap-3">
          {/* El título se oculta en vertical estrecho. Cabría —ahí la tarjeta
              crece—, pero alargar la tarjeta en un móvil se paga en scroll,
              y los otros tres campos ya cuentan lo que hay que contar. */}
          <div className="hidden sm:block">
            <dt className="text-[10px] text-muted-foreground">Título</dt>
            <dd className="mt-1 grid text-xs font-medium">
              {LOCALES.map((locale, i) => (
                <span
                  key={locale.code}
                  data-active={i === active || undefined}
                  aria-hidden={i !== active}
                  className="demo-swap col-start-1 row-start-1 truncate"
                >
                  {locale.title}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-[10px] text-muted-foreground">URL pública</dt>
            <dd className="mt-1 grid font-mono text-xs">
              {LOCALES.map((locale, i) => (
                <span
                  key={locale.code}
                  data-active={i === active || undefined}
                  aria-hidden={i !== active}
                  className="demo-swap col-start-1 row-start-1 truncate"
                >
                  {locale.url}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-[10px] text-muted-foreground">Contenido</dt>
            <dd className="mt-1 grid text-sm leading-snug">
              {LOCALES.map((locale, i) => (
                <span
                  key={locale.code}
                  data-active={i === active || undefined}
                  aria-hidden={i !== active}
                  className="demo-swap col-start-1 row-start-1"
                >
                  {locale.text}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-[10px] text-muted-foreground">Estado de esta traducción</dt>
            <dd className="mt-1 grid justify-items-start">
              {LOCALES.map((locale, i) => (
                <span
                  key={locale.code}
                  data-active={i === active || undefined}
                  aria-hidden={i !== active}
                  className={`demo-swap col-start-1 row-start-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${locale.statusClass}`}
                >
                  {locale.status}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </Frame>
  );
}

/* ─────────────────────────────────────────────────────────────
   3 · Tu web lo recibe
   El cable se dibuja de Kontorōru a la web, viaja el nombre del
   evento, al otro lado se enciende un anillo, el estado pasa por
   «revalidando» y aterriza en «actualizado», y entonces se
   escribe la llamada que lo lee todo.
   ───────────────────────────────────────────────────────────── */
export function ApiDemo() {
  const { ref, cycle, playing } = useDemoLoop<HTMLDivElement>(API_PERIOD);

  return (
    <Frame label="post.published → tu-web.com" badge="Webhook" playing={playing} frameRef={ref}>
      <div
        key={cycle}
        className="animate-demo-cycle flex min-h-0 flex-1 flex-col p-5"
        style={{ animationDuration: `${API_PERIOD}ms` }}
      >
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-lg border bg-background/40 px-2 py-5">
            <Radio className="size-4 text-muted-foreground" />
            <span className="text-[10px] font-medium">Kontorōru</span>
          </div>

          <div className="relative min-w-0 flex-1">
            <span
              className="animate-demo-pop absolute -top-3 left-1/2 -translate-x-1/2 rounded border bg-card px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground"
              style={{ animationDelay: "800ms" }}
            >
              post.published
            </span>
            <span
              className="animate-demo-draw block h-px w-full"
              style={{ backgroundColor: "var(--brand-secondary)", animationDelay: "300ms" }}
            />
          </div>

          <div className="relative flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-lg border bg-background/40 px-2 py-5">
            <span
              className="animate-demo-pulse absolute inset-0 rounded-lg opacity-0"
              style={{ boxShadow: "0 0 0 3px var(--brand-secondary)", animationDelay: "1050ms" }}
            />
            <Globe className="size-4 text-muted-foreground" />
            <span className="text-[10px] font-medium">tu web</span>
          </div>
        </div>

        {/* Tres estados en la misma celda: el primero se va, el segundo
            asoma y se va, el tercero se queda. */}
        <div className="mt-4 grid flex-1 content-center justify-items-center gap-2 text-[11px]">
          <span
            className="animate-demo-out col-start-1 row-start-1 text-muted-foreground opacity-0"
            style={{ animationDelay: "1100ms" }}
          >
            en espera
          </span>
          <span
            className="animate-demo-blip col-start-1 row-start-1 text-muted-foreground opacity-0"
            style={{ animationDelay: "1150ms" }}
          >
            revalidando…
          </span>
          <span
            className="animate-demo-in col-start-1 row-start-1 flex items-center gap-1 font-medium text-emerald-300"
            style={{ animationDelay: "2000ms" }}
          >
            <Check className="size-3" />
            actualizado
          </span>

          <span
            className="animate-demo-pop col-start-1 row-start-2 font-mono text-[10px] text-muted-foreground"
            style={{ animationDelay: "2250ms" }}
          >
            firma verificada · x-kontororu-signature
          </span>
        </div>

        <div className="demo-code mt-4 shrink-0 overflow-x-auto rounded-lg border bg-background/40 p-3">
          <code className="font-mono text-[11px] whitespace-nowrap">
            <Typed delay={2300} duration={900}>
              <span style={{ color: "var(--code-keyword)" }}>const</span>
              <span className="text-muted-foreground">{" { data } = "}</span>
              <span style={{ color: "var(--code-keyword)" }}>await</span>
              <span className="text-muted-foreground"> kontororu.</span>
              <span style={{ color: "var(--code-fn)" }}>listPosts</span>
              <span className="text-muted-foreground">()</span>
            </Typed>
          </code>
        </div>
      </div>
    </Frame>
  );
}
