"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Panel lateral del complemento: entra desde la derecha, se cierra por la X,
 * por el fondo o con Escape.
 *
 * Vive aquí y no en `components/ui` porque de momento sólo lo usan las dos
 * pantallas del Portfolio. Si aparece un tercer sitio que lo necesite, este
 * es el archivo que se sube a `ui/`.
 */
export function AddonDrawer({
  title,
  isBusy,
  onClose,
  children,
}: {
  title: string;
  /** Mientras se guarda no se cierra: cerrar a medias deja el envío huérfano. */
  isBusy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isBusy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={`Cerrar ${title.toLowerCase()}`}
        onClick={() => !isBusy && onClose()}
        className="absolute inset-0 animate-backdrop-in bg-background/60"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-md animate-drawer-in flex-col border-l bg-card shadow-lg"
      >
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <h2 className="font-medium">{title}</h2>
          <button
            type="button"
            onClick={() => !isBusy && onClose()}
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-[var(--radius)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        {children}
      </aside>
    </div>
  );
}
