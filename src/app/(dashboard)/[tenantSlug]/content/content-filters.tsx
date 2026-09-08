"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { localeLabel } from "@/lib/content/locales";

/** Lo que tarda en dispararse la búsqueda desde la última tecla. */
const TYPING_PAUSE_MS = 300;

const SELECT_CLASS =
  "h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-[size:16px_auto] bg-no-repeat pr-8";

export type ContentFilterState = {
  status: string;
  q: string;
  category: string;
  locale: string;
  view: string;
};

/**
 * Los tres filtros del inventario: título, idioma y categoría.
 *
 * Filtran igual que antes —en el servidor, sobre la consulta paginada, porque
 * el listado sólo trae veinte filas y filtrar en cliente escondería el
 * resto—, pero sin pedirle al usuario que confirme: escribir ya busca y
 * elegir en un desplegable ya filtra. La URL sigue siendo la fuente de
 * verdad, así que el estado se comparte, se marca y sobrevive al recargar.
 *
 * Cada cambio reescribe la query string entera desde el estado actual: los
 * formularios de antes iban por separado y buscar un título tiraba el idioma
 * y la categoría que hubiera puestos.
 */
export function ContentFilters({
  tenantSlug,
  current,
  locales,
  categories,
}: {
  tenantSlug: string;
  current: ContentFilterState;
  /** Vacío —o de un solo idioma— esconde el selector de idiomas. */
  locales: string[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(current.q);

  // Sólo se navega desde el efecto cuando el texto difiere de lo que la URL
  // ya está pintando; sin esto, volver atrás o llegar con `?q=` dispararía
  // una navegación redundante nada más montar.
  const urlTerm = current.q;

  const navigate = (patch: Partial<ContentFilterState>) => {
    const merged = { ...current, ...patch };
    const sp = new URLSearchParams();
    // `page` se cae a propósito: al cambiar un filtro, la página 3 de la
    // búsqueda anterior no significa nada en la nueva.
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    const qs = sp.toString();
    startTransition(() => {
      router.replace(`/${tenantSlug}/content${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  // `navigate` se recrea en cada render; el efecto depende del texto, no de
  // la función, así que se lee por ref para no reprogramar el temporizador en
  // renders que no vienen de teclear.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (term === urlTerm) return;
    const timer = setTimeout(() => navigateRef.current({ q: term }), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [term, urlTerm]);

  // La papelera se lista fila a fila y con su propio criterio: sus filtros no
  // son éstos.
  const showLocales = locales.length > 1;

  return (
    /*
     * Los tres filtros viajan juntos y pegados al borde derecho: `ml-auto` se
     * aplica al grupo, no al buscador, para que los desplegables no se queden
     * sueltos en el hueco del medio.
     *
     * En móvil la fila se apila y el grupo ocupa el ancho entero, así que ahí
     * no hay derecha a la que alinearse.
     */
    <div className="flex w-full flex-col gap-3 md:ml-auto md:w-auto md:flex-row md:items-center">
      {showLocales && (
        <select
          name="locale"
          value={current.locale}
          onChange={(e) => navigate({ locale: e.target.value })}
          aria-label="Filtrar por idioma"
          className={SELECT_CLASS}
        >
          <option value="">Todos los idiomas</option>
          {locales.map((code) => (
            <option key={code} value={code}>
              {localeLabel(code)}
            </option>
          ))}
        </select>
      )}

      {categories.length > 0 && (
        <select
          name="category"
          value={current.category}
          onChange={(e) => navigate({ category: e.target.value })}
          aria-label="Filtrar por categoría"
          className={SELECT_CLASS}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {/* El buscador cierra el grupo, con los desplegables inmediatamente a
          su izquierda. */}
      <div className="relative w-full md:w-auto">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          // Enter no aporta nada cuando ya se busca solo, pero recargaría la
          // página si el navegador lo tratara como envío.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Buscar por título…"
          aria-label="Buscar por título"
          className="w-full md:w-56 pl-8 pr-8"
        />
        {isPending && (
          <Loader2 className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
