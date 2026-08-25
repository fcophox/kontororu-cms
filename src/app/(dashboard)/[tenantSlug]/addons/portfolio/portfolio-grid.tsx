"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ExternalLink, ImageOff, Images, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PortfolioItem } from "@/lib/addons/portfolio";
import { PortfolioItemDrawer } from "./portfolio-item-drawer";
import type { PortfolioState } from "./actions";

/**
 * Los trabajos del portfolio, con su edición y su borrado.
 *
 * Es cliente entera y no una rejilla de servidor con islas: editar abre el
 * drawer sobre UN elemento, y ese "cuál" es estado que tienen que compartir
 * todas las tarjetas.
 */
export function PortfolioGrid({
  items,
  tenantId,
  categories,
  updateAction,
  deleteAction,
}: {
  items: PortfolioItem[];
  tenantId: string;
  categories: string[];
  updateAction: (prev: PortfolioState, formData: FormData) => Promise<PortfolioState>;
  deleteAction: (id: string) => Promise<PortfolioState>;
}) {
  const [editing, setEditing] = useState<PortfolioItem | null>(null);
  const [toDelete, setToDelete] = useState<PortfolioItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card">
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
          <Images className="size-10 opacity-20" />
          <p className="text-sm">
            Todavía no has añadido ningún trabajo. Crea el primero y aparecerá aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {deleteError && <p className="mb-4 text-sm text-destructive">{deleteError}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-[var(--radius)] border bg-card"
          >
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt=""
                width={640}
                height={360}
                className="h-40 w-full object-cover"
              />
            ) : (
              <div className="grid h-40 w-full place-items-center bg-muted text-muted-foreground">
                <ImageOff className="size-6 opacity-40" />
              </div>
            )}

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="font-medium">{item.title}</h2>
                {item.category && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {item.category}
                  </span>
                )}
              </div>

              {item.description && (
                <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
              )}

              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-4" />
                  Ver el trabajo
                </a>
              )}

              <div className="mt-2 flex items-center gap-1 border-t pt-2">
                <IconButton label="Editar" onClick={() => setEditing(item)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label="Eliminar"
                  variant="destructive"
                  onClick={() => {
                    setDeleteError(null);
                    setToDelete(item);
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <PortfolioItemDrawer
          key={editing.id}
          tenantId={tenantId}
          categories={categories}
          item={editing}
          onClose={() => setEditing(null)}
          submitAction={updateAction}
        />
      )}

      <ConfirmDialog
        isOpen={toDelete !== null}
        variant="destructive"
        title="¿Eliminar este trabajo?"
        description={
          toDelete
            ? `«${toDelete.title}» desaparece del portfolio y de tu web. La imagen se queda en Medios.`
            : ""
        }
        confirmText="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const target = toDelete;
          if (!target) return;
          setToDelete(null);
          startTransition(async () => {
            const result = await deleteAction(target.id);
            if (result.error) setDeleteError(result.error);
          });
        }}
      />
    </>
  );
}

function IconButton({
  label,
  variant = "default",
  onClick,
  children,
}: {
  label: string;
  variant?: "default" | "destructive";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-[var(--radius)] transition-colors ${
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  );
}
