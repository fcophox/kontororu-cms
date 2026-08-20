"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AVAILABLE_LOCALES } from "@/lib/content/locales";
import type { LocalesState } from "./actions";

export function LocalesForm({
  active,
  defaultLocale,
  counts,
  saveAction,
}: {
  active: string[];
  defaultLocale: string;
  /** Contenidos por idioma: desactivar a ciegas es lo que hace perder páginas. */
  counts: Record<string, number>;
  saveAction: (prev: LocalesState, formData: FormData) => Promise<LocalesState>;
}) {
  const router = useRouter();
  const [state, formAction, isSaving] = useActionState<LocalesState, FormData>(saveAction, {});
  const [selected, setSelected] = useState<string[]>(active);
  const [primary, setPrimary] = useState(defaultLocale);

  // Tras guardar, el servidor es la verdad. Sin este refresco el árbol cliente
  // se queda con la respuesta anterior y los checks sólo cuadran al recargar
  // la URL a mano. Cada resultado de la acción es un objeto nuevo, así que
  // depender de `state` dispara el refresco también al guardar dos veces.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  // Y cuando esa versión nueva llega, los checks la siguen: si algo dejó la
  // pantalla mostrando los idiomas de antes, aquí se corrige sola en vez de
  // enseñar un estado que ya no es el guardado. Se compara por valor, no por
  // identidad, para no pisar una selección a medias en cada re-render.
  const activeKey = active.join(",");
  const [syncedActive, setSyncedActive] = useState(activeKey);
  if (syncedActive !== activeKey) {
    setSyncedActive(activeKey);
    setSelected(active);
    setPrimary(defaultLocale);
  }

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      // El principal no puede quedar fuera: se reasigna solo en vez de
      // dejar guardar algo que la base rechazaría.
      if (!next.includes(primary) && next.length) setPrimary(next[0]!);
      return next;
    });
  };

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      {selected.map((code) => (
        <input key={code} type="hidden" name="locales" value={code} />
      ))}
      <input type="hidden" name="defaultLocale" value={primary} />

      <section className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Globe className="size-3.5" />
          Idiomas activos
        </Label>

        <ul className="divide-y rounded-[var(--radius)] border bg-card">
          {AVAILABLE_LOCALES.map((locale) => {
            const isActive = selected.includes(locale.code);
            const count = counts[locale.code] ?? 0;

            return (
              <li key={locale.code} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  id={`locale-${locale.code}`}
                  checked={isActive}
                  onChange={() => toggle(locale.code)}
                  className="size-4 accent-[var(--primary)]"
                />
                <label htmlFor={`locale-${locale.code}`} className="min-w-0 flex-1 text-sm">
                  {locale.label}
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {locale.code}
                  </span>
                  {count > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {count} {count === 1 ? "contenido" : "contenidos"}
                    </span>
                  )}
                </label>

                {isActive &&
                  (primary === locale.code ? (
                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                      principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(locale.code)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      hacer principal
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          El idioma principal es el que sirve la API cuando la petición no pide
          ninguno — así una web ya conectada no cambia de comportamiento al
          añadir idiomas.
        </p>
      </section>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving || selected.length === 0}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          Guardar idiomas
        </Button>
        {state.ok && !isSaving && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-4" />
            {state.ok}
          </span>
        )}
      </div>
    </form>
  );
}
