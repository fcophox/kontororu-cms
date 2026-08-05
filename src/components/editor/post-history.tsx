"use client";

import { useState, useTransition } from "react";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type Revision = {
  id: string;
  version: number;
  title: string;
  author: string | null;
  createdAt: string;
  /** Longitud del cuerpo: da una pista de si aquella versión era más o menos larga. */
  size: number;
};

const VISIBLE = 5;

/**
 * Historial de versiones.
 *
 * Muestra las últimas y despliega el resto bajo demanda: el caso normal es
 * "he roto algo hace un rato", no arqueología. Restaurar no destruye nada —
 * el guardado genera una versión nueva, así que lo que había antes sigue ahí.
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
  const [pending, startTransition] = useTransition();

  if (revisions.length === 0) return null;

  const shown = expanded ? revisions : revisions.slice(0, VISIBLE);

  return (
    <section className="space-y-2 border-t pt-4">
      <Label className="flex items-center gap-1.5">
        <History className="size-3.5" />
        Historial
      </Label>

      <ol className="space-y-1">
        {shown.map((rev, index) => {
          // La primera de la lista es el estado actual: restaurarla no haría nada.
          const isCurrent = index === 0;
          const delta = rev.size - (index === 0 ? currentSize : revisions[index - 1]!.size);

          return (
            <li
              key={rev.id}
              className="flex items-start gap-2 rounded-[var(--radius)] px-2 py-1.5 text-xs hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">v{rev.version}</span>
                  {isCurrent && (
                    <span className="rounded bg-secondary px-1 text-[10px] text-secondary-foreground">
                      actual
                    </span>
                  )}
                </div>
                <p className="truncate text-muted-foreground">
                  {formatWhen(rev.createdAt)}
                  {rev.author ? ` · ${rev.author}` : ""}
                </p>
                {!isCurrent && delta !== 0 && (
                  <p className="text-muted-foreground">
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
                  className="h-6 shrink-0 px-1.5"
                  disabled={Boolean(pending)}
                  aria-label={`Restaurar versión ${rev.version}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Restaurar la versión ${rev.version}. El contenido actual se guarda como una versión más, así que podrás volver.`,
                      )
                    )
                      return;
                    startTransition(async () => restoreAction(rev.id));
                  }}
                >
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                </Button>
              )}
            </li>
          );
        })}
      </ol>

      {revisions.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Ver menos" : `Ver las ${revisions.length} versiones`}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        Restaurar recupera el texto, no la URL ni el estado de publicación.
      </p>
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
