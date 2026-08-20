"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GALLERY_OPTIONS, type PortfolioSettings } from "@/lib/addons/portfolio";
import { AddonDrawer } from "./addon-drawer";
import type { PortfolioState } from "./actions";

/**
 * Botón de configuración del Portfolio y su drawer.
 *
 * La galería se elige aquí y no en la propia pantalla porque la pantalla es
 * para los trabajos: el ajuste se toca una vez y estorbaría arriba el resto
 * del tiempo.
 */
export function PortfolioSettingsDrawer({
  initial,
  saveAction,
}: {
  initial: PortfolioSettings;
  saveAction: (prev: PortfolioState, formData: FormData) => Promise<PortfolioState>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [gallery, setGallery] = useState(initial.gallery);
  const [isPublished, setIsPublished] = useState(initial.isPublished);
  const [state, formAction, isSaving] = useActionState<PortfolioState, FormData>(
    saveAction,
    {},
  );

  // Al cerrar sin guardar, la elección vuelve a lo que hay en la base: dejar
  // el radio marcado en algo que no se guardó miente sobre el estado real.
  const close = () => {
    setGallery(initial.gallery);
    setIsPublished(initial.isPublished);
    setIsOpen(false);
  };

  // Guardar cierra: el aviso de éxito quedaría escondido tras el panel.
  useEffect(() => {
    if (state.ok) setIsOpen(false);
  }, [state.ok]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <Settings2 className="size-4" />
        Configurar
      </Button>

      {state.ok && !isOpen && (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-4" />
          {state.ok}
        </p>
      )}

      {isOpen && (
        <AddonDrawer title="Configuración" isBusy={isSaving} onClose={close}>
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            {/* El JSON viaja en un campo oculto: el esquema de Zod valida lo
                mismo aquí y en el servidor sin traducir nombres de campo. */}
            <input
              type="hidden"
              name="settings"
              value={JSON.stringify({ gallery, isPublished })}
            />

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* La visibilidad va primero: es la decisión que se viene a
                  tomar, la galería se elige una vez y no se vuelve a tocar. */}
              <div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Visible en la web</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Apagado, tu web deja de recibir el portfolio y la sección
                    desaparece. Lo que hayas creado se queda aquí intacto.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublished}
                  aria-label="Visible en la web"
                  onClick={() => setIsPublished((prev) => !prev)}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
                    isPublished ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`block size-5 rounded-full bg-background shadow-sm transition-transform ${
                      isPublished ? "translate-x-5.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Galería
                </legend>

                {GALLERY_OPTIONS.map((option) => {
                  const isSelected = gallery === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border p-3 text-sm transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "hover:bg-accent"
                      }`}
                    >
                      <input
                        type="radio"
                        name="gallery"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setGallery(option.value)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </fieldset>

              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            </div>

            <footer className="border-t p-4">
              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </footer>
          </form>
        </AddonDrawer>
      )}
    </>
  );
}
