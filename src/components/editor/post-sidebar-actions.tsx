"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Link2, Archive, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/content/slug";
import type { SlugState } from "@/app/(dashboard)/[tenantSlug]/content/actions";

/**
 * URL y ciclo de vida del contenido.
 *
 * Van en la barra lateral y no en un menú "…" de la cabecera: cambiar la URL
 * necesita un campo de texto con su aviso, y esconder tras un menú la única
 * forma de archivar o borrar hace que nadie las encuentre. El coste es un
 * poco más de barra lateral; la ventaja, que ambas acciones se explican donde
 * se usan.
 */
export function PostSidebarActions({
  slug,
  status,
  isPublished,
  canEditSlug,
  canDelete,
  updateSlugAction,
  archiveAction,
  trashAction,
  restoreAction,
  isTrashed,
}: {
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isPublished: boolean;
  canEditSlug: boolean;
  canDelete: boolean;
  updateSlugAction: (prev: SlugState, formData: FormData) => Promise<SlugState>;
  archiveAction: () => Promise<void>;
  trashAction: () => Promise<void>;
  restoreAction: () => Promise<void>;
  isTrashed: boolean;
}) {
  const [slugState, slugFormAction, isSavingSlug] = useActionState<SlugState, FormData>(
    updateSlugAction,
    {},
  );
  const [draft, setDraft] = useState(slug);
  const [pending, startTransition] = useTransition();

  const current = slugState.slug ?? slug;
  const changed = slugify(draft) !== current;

  if (isTrashed) {
    return (
      <section className="space-y-2 rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Trash2 className="size-4" />
          En la papelera
        </div>
        <p className="text-xs text-muted-foreground">
          No aparece en la API ni en la web. Se puede recuperar.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={Boolean(pending)}
          onClick={() => startTransition(async () => restoreAction())}
        >
          <RotateCcw className="size-3.5" />
          Restaurar
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-2">
        <Label htmlFor="post-slug" className="flex items-center gap-1.5">
          <Link2 className="size-3.5" />
          URL pública
        </Label>

        {/* Formulario propio: anidarlo dentro del form del editor no es válido
            en HTML y haría que Guardar disparase también este cambio. */}
        <form action={slugFormAction} className="space-y-1.5">
          <Input
            id="post-slug"
            name="slug"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft(slugify(draft) || current)}
            disabled={!canEditSlug}
            spellCheck={false}
            className="font-mono text-xs"
          />

          {changed && canEditSlug && (
            <>
              {isPublished && (
                <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Los enlaces a <code className="font-mono">/{current}</code> dejarán de
                  funcionar. Avisamos a tu web para que retire la dirección antigua.
                </p>
              )}
              <Button type="submit" size="sm" variant="outline" disabled={isSavingSlug}>
                {isSavingSlug && <Loader2 className="size-3.5 animate-spin" />}
                Cambiar URL
              </Button>
            </>
          )}

          {slugState.error && <p className="text-xs text-destructive">{slugState.error}</p>}
        </form>
      </section>

      {canDelete && (
        <section className="space-y-2 border-t pt-4">
          <Label>Ciclo de vida</Label>

          <div className="flex flex-col gap-1.5">
            {status !== "ARCHIVED" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(pending)}
                onClick={() => {
                  if (
                    isPublished &&
                    !window.confirm(
                      "Archivar retira el contenido de tu web. Podrás volver a publicarlo cuando quieras.",
                    )
                  )
                    return;
                  startTransition(async () => archiveAction());
                }}
              >
                <Archive className="size-3.5" />
                Archivar
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={Boolean(pending)}
              onClick={() => {
                if (
                  !window.confirm(
                    "Se mueve a la papelera y desaparece de tu web. Podrás recuperarlo desde el listado.",
                  )
                )
                  return;
                startTransition(async () => trashAction());
              }}
            >
              <Trash2 className="size-3.5" />
              Mover a la papelera
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Archivar lo guarda para más adelante; la papelera lo retira y se puede
            vaciar después.
          </p>
        </section>
      )}
    </>
  );
}
