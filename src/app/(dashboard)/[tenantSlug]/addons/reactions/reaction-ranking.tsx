"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";

export type RankingRow = {
  postId: string;
  translationGroupId: string;
  title: string;
  slug: string;
  status: string;
  total: number;
  gestures: { key: string; label: string; total: number }[];
};

/**
 * El ranking de contenidos por reacciones.
 *
 * Ordenado de más a menos y sin paginar: quien abre esta pantalla quiere saber
 * qué funciona, y eso está en las primeras filas. El inventario completo ya
 * está en Contenido.
 */
export function ReactionRanking({
  basePath,
  rows,
  resetAction,
}: {
  basePath: string;
  rows: RankingRow[];
  resetAction: (translationGroupId: string) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Todavía no ha reaccionado nadie.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Conecta el botón de tu web con el endpoint de abajo y las primeras
          reacciones aparecerán aquí.
        </p>
      </div>
    );
  }

  // La barra se mide contra el contenido más aplaudido, no contra el total:
  // comparar cada fila con la suma haría que con veinte contenidos todas las
  // barras fuesen invisibles.
  const top = rows[0]!.total || 1;

  return (
    <div className="divide-y rounded-[var(--radius)] border bg-card">
      {rows.map((row) => (
        <RankingItem
          key={row.translationGroupId}
          row={row}
          share={row.total / top}
          href={`${basePath}/${row.postId}`}
          resetAction={resetAction}
        />
      ))}
    </div>
  );
}

function RankingItem({
  row,
  share,
  href,
  resetAction,
}: {
  row: RankingRow;
  share: number;
  href: string;
  resetAction: (translationGroupId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={href} className="truncate font-medium hover:underline">
            {row.title}
          </Link>
          <StatusBadge status={row.status} />
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          /{row.slug}
          {row.gestures.length > 0 && " · "}
          {row.gestures.map((g) => `${g.label}: ${g.total}`).join(" · ")}
        </p>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(2, share * 100)}%` }}
          />
        </div>
      </div>

      <p className="shrink-0 text-lg font-semibold tabular-nums">{row.total}</p>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await resetAction(row.translationGroupId);
                setConfirming(false);
              })
            }
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Confirmar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          onClick={() => setConfirming(true)}
          title="Poner el contador a cero"
        >
          <RotateCcw className="size-4" />
        </Button>
      )}
    </div>
  );
}
