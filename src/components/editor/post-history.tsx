"use client";

import { useState, useTransition } from "react";
import { History, RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type Revision = {
  id: string;
  version: number;
  title: string;
  author: string | null;
  createdAt: string;
  /** Longitud del cuerpo: da una pista de si aquella versión era más o menos larga. */
  size: number;
};

/**
 * Historial de versiones.
 *
 * Muestra la versión actual y permite desplegar el resto bajo demanda
 * mediante un acordeón para no saturar la barra lateral.
 */
export function PostHistory({
  revisions,
  currentSize,
  canRestore,
  restoreAction,
}: {
  revisions: Revision[];
  currentSize: number;
  canRestore: boolean;
  restoreAction: (revisionId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending] = useTransition();
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);

  if (revisions.length === 0) return null;

  const currentRevision = revisions[0];

  return (
    <section className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <History className="size-4" />
        Historial
      </Label>

      {/* Select-like input trigger */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex h-9 w-full items-center justify-between rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-foreground">v{currentRevision.version}</span>
          <span className="text-muted-foreground truncate">
            (Actual · {formatWhen(currentRevision.createdAt)})
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Revisions list shown when expanded */}
      {expanded && (
        <div className="rounded-[var(--radius)] border border-border bg-card p-1 shadow-sm space-y-0.5 max-h-48 overflow-y-auto animate-in fade-in duration-200">
          {revisions.map((rev, index) => {
            const isCurrent = index === 0;
            const delta = rev.size - (index === 0 ? currentSize : revisions[index - 1]!.size);

            return (
              <div
                key={rev.id}
                className={`flex items-start gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors ${
                  isCurrent ? "bg-accent/40 text-foreground" : "hover:bg-accent"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">v{rev.version}</span>
                    {isCurrent && (
                      <span className="rounded bg-secondary px-1 text-[9px] font-semibold text-secondary-foreground">
                        actual
                      </span>
                    )}
                  </div>
                  <p className="truncate text-muted-foreground">
                    {formatWhen(rev.createdAt)}
                    {rev.author ? ` · ${rev.author}` : ""}
                  </p>
                  {!isCurrent && delta !== 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {delta > 0 ? "+" : ""}
                      {delta} caracteres
                    </p>
                  )}
                </div>

                {canRestore && !isCurrent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-1.5 cursor-pointer hover:bg-background/80"
                    disabled={Boolean(pending)}
                    aria-label={`Restaurar versión ${rev.version}`}
                    onClick={() => {
                      setSelectedRevision(rev);
                      setIsRestoreConfirmOpen(true);
                    }}
                  >
                    {pending && selectedRevision?.id === rev.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3" />
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Restaurar recupera el texto, no la URL ni el estado de publicación.
      </p>

      <ConfirmDialog
        isOpen={isRestoreConfirmOpen}
        title={`¿Restaurar versión v${selectedRevision?.version}?`}
        description="El contenido actual se guardará como una versión más en el historial, por lo que podrás volver a él en cualquier momento."
        confirmText="Restaurar"
        onConfirm={async () => {
          if (selectedRevision) {
            setIsRestoreConfirmOpen(false);
            await restoreAction(selectedRevision.id);
            setSelectedRevision(null);
          }
        }}
        onCancel={() => {
          setIsRestoreConfirmOpen(false);
          setSelectedRevision(null);
        }}
        variant="warning"
        icon={RotateCcw}
      />
    </section>
  );
}

/** "hace 5 min" es más útil que una fecha cuando lo que buscas es lo último. */
function formatWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
