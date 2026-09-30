import { FileText, FolderTree, Globe, ImageIcon, LayoutDashboard, Puzzle, Users } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";

const NAV = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Contenido", icon: FileText, active: true },
  { label: "Categorías", icon: FolderTree },
  { label: "Medios", icon: ImageIcon },
  { label: "Equipo", icon: Users },
  { label: "Idiomas", icon: Globe },
  { label: "Complementos", icon: Puzzle },
];

/*
 * Hay más entradas de las que caben, y es a propósito: la lista se corta por
 * abajo contra el borde de la ventana, como se corta en un panel de verdad.
 * Con cinco filas, un marco 16:9 se queda medio vacío y deja de parecer una
 * captura para parecer una maqueta.
 */
const ROWS = [
  { title: "Cómo elegimos la paleta de un proyecto", status: "PUBLISHED", locales: ["ES", "EN"], when: "hace 2 h" },
  { title: "Caso de estudio · Rediseño de tienda", status: "PUBLISHED", locales: ["ES"], when: "ayer" },
  { title: "Novedades del verano", status: "DRAFT", locales: ["ES"], when: "hace 3 d" },
  { title: "Servicios de branding", status: "PUBLISHED", locales: ["ES", "EN"], when: "hace 1 sem" },
  { title: "Tipografías que envejecen bien", status: "DRAFT", locales: ["ES"], when: "hace 1 sem" },
  { title: "Caso de estudio · Identidad para una bodega", status: "PUBLISHED", locales: ["ES", "EN"], when: "hace 2 sem" },
  { title: "Qué pedimos antes de empezar un encargo", status: "PUBLISHED", locales: ["ES"], when: "hace 3 sem" },
  { title: "Guía de marca para equipos pequeños", status: "PUBLISHED", locales: ["ES", "EN"], when: "hace 1 mes" },
  { title: "Rediseñar sin perder posicionamiento", status: "PUBLISHED", locales: ["ES"], when: "hace 1 mes" },
  { title: "Nota antigua de prensa", status: "ARCHIVED", locales: ["ES"], when: "hace 4 mes" },
  { title: "Plantillas de propuesta", status: "DRAFT", locales: ["ES"], when: "hace 4 mes" },
  { title: "Caso de estudio · App de reservas", status: "PUBLISHED", locales: ["ES", "EN"], when: "hace 5 mes" },
  { title: "Fotografía de producto: lo básico", status: "PUBLISHED", locales: ["ES"], when: "hace 6 mes" },
];

/**
 * Retrato del panel para la portada: mismos componentes de estado y misma
 * navegación que el CMS real, para que quien entre luego reconozca lo que
 * vio aquí. Es decorativo —`aria-hidden`—, así que nada de lo que dice hace
 * falta para entender la página con un lector de pantalla.
 *
 * El marco es 16:9 con `aspect-video`, y de ahí sale la regla de reparto de
 * dentro: la barra de ventana y la cabecera miden lo que miden (`shrink-0`),
 * y la lista se queda con lo que sobre (`flex-1` + `min-h-0`). El `min-h-0`
 * no es adorno: sin él un hijo flex se niega a encoger por debajo de su
 * contenido y la lista desborda el marco en vez de recortarse dentro.
 *
 * En vertical estrecho el 16:9 deja 211px de alto —menos de tres filas—, así
 * que por debajo de `sm` el marco es 4:3. La proporción apaisada es de
 * pantalla apaisada; forzarla en un móvil no enseña el producto, lo esconde.
 */
export function PanelMock() {
  return (
    <div
      aria-hidden
      className="flex aspect-[4/3] flex-col overflow-hidden rounded-xl border bg-card shadow-lg select-none sm:aspect-video"
    >
      {/* Barra de ventana: tres puntos y la URL del espacio. */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-background/60 px-4 py-3">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <div className="ml-3 flex-1 truncate rounded-md bg-muted px-3 py-1 text-center font-mono text-[11px] text-muted-foreground">
          kontororu.app/tu-estudio/content
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-48 shrink-0 flex-col border-r bg-sidebar p-3 sm:flex">
          <div className="mb-4 flex items-center gap-2 px-2">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              T
            </span>
            <span className="truncate text-sm font-medium">Tu Estudio</span>
          </div>
          <nav className="space-y-0.5">
            {NAV.map(({ label, icon: Icon, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </nav>

          {/* `mt-auto` ancla la ficha abajo: es lo que impide que una barra
              lateral alta se quede con un vacío colgando al final. */}
          <div className="mt-auto flex items-center gap-2 border-t px-2 pt-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">
              A
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium">Ana Ruiz</span>
              <span className="block truncate text-[10px] text-muted-foreground">Editora</span>
            </span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Contenido</p>
              <p className="text-xs text-muted-foreground">28 entradas · 2 idiomas</p>
            </div>
            <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
              Nueva entrada
            </span>
          </div>

          <div className="min-h-0 flex-1 divide-y overflow-hidden rounded-lg border">
            {ROWS.map((row) => (
              <div key={row.title} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">{row.title}</span>
                <span className="hidden gap-1 sm:flex">
                  {row.locales.map((locale) => (
                    <span
                      key={locale}
                      className="rounded border px-1 text-[10px] text-muted-foreground"
                    >
                      {locale}
                    </span>
                  ))}
                </span>
                <StatusBadge status={row.status} />
                <span className="hidden w-16 text-right text-[10px] text-muted-foreground md:block">
                  {row.when}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
