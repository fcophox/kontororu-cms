"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Link2, Archive, Trash2, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify, slugifyLive } from "@/lib/content/slug";
import type { SlugState } from "@/app/(dashboard)/[tenantSlug]/content/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  mode = "all",
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
  mode?: "all" | "slug" | "lifecycle";
}) {
  const [slugState, slugFormAction, isSavingSlug] = useActionState<SlugState, FormData>(
    updateSlugAction,
    {},
  );
  const [draft, setDraft] = useState(slug);
  const [pending, startTransition] = useTransition();
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isTrashConfirmOpen, setIsTrashConfirmOpen] = useState(false);

  const current = slugState.slug ?? slug;
  const changed = slugify(draft) !== current;

  if (isTrashed) {
    if (mode === "slug") return null;
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

  const showSlug = mode === "all" || mode === "slug";
  const showLifecycle = mode === "all" || mode === "lifecycle";

  return (
    <>
      {showSlug && (
        <section className="space-y-2">
          <Label htmlFor="post-slug" className="flex items-center gap-1.5">
            <Link2 className="size-3.5" />
            URL pública
          </Label>

          {/* Formulario propio: anidarlo dentro del form del editor no es válido
              en HTML y haría que Guardar disparase también este cambio. */}
          <form action={slugFormAction} className="space-y-1.5">
            {/* El formato se aplica al escribir, no al salir del campo: así se
                puede pegar un titular tal cual —"Los agentes de IA ya no piden
                permiso"— y queda listo sin repasarlo a mano. */}
            <Input
              id="post-slug"
              name="slug"
              value={draft}
              onChange={(e) => setDraft(slugifyLive(e.target.value))}
              onBlur={() => setDraft(slugify(draft) || current)}
              disabled={!canEditSlug}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-mono text-xs"
            />

            {changed && canEditSlug && (
              <>
                {isPublished && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-normal">
                    <AlertTriangle className="mr-1.5 inline-block size-3.5 align-text-bottom shrink-0 text-amber-600 dark:text-amber-500" />
                    Los enlaces a <code className="font-mono break-all bg-amber-500/10 rounded px-1 text-[11px] font-semibold">/{current}</code> dejarán de funcionar. Avisamos a tu web para que retire la dirección antigua.
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
      )}

      {showLifecycle && canDelete && (
        <section className="space-y-2 border-t pt-4">
          <Label className="flex items-center gap-1.5 text-destructive dark:text-red-400">
            <Lock className="size-3.5" />
            Danger Zone
          </Label>

          <div className="flex flex-col gap-1.5">
            {status !== "ARCHIVED" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(pending)}
                onClick={() => {
                  if (isPublished) {
                    setIsArchiveConfirmOpen(true);
                  } else {
                    startTransition(async () => archiveAction());
                  }
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
                setIsTrashConfirmOpen(true);
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

      <ConfirmDialog
        isOpen={isArchiveConfirmOpen}
        title="¿Archivar contenido?"
        description="Archivar retira el contenido de tu web. Podrás volver a publicarlo cuando quieras."
        confirmText="Archivar"
        onConfirm={async () => {
          setIsArchiveConfirmOpen(false);
          await archiveAction();
        }}
        onCancel={() => setIsArchiveConfirmOpen(false)}
        variant="warning"
        icon={Archive}
      />

      <ConfirmDialog
        isOpen={isTrashConfirmOpen}
        title="¿Mover a la papelera?"
        description="Se mueve a la papelera y desaparece de tu web. Podrás recuperarlo desde el listado."
        confirmText="Mover a la papelera"
        onConfirm={async () => {
          setIsTrashConfirmOpen(false);
          await trashAction();
        }}
        onCancel={() => setIsTrashConfirmOpen(false)}
        variant="destructive"
        icon={Trash2}
      />
    </>
  );
}
