"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Restaurar o destruir un contenido de la papelera.
 *
 * El borrado definitivo pide escribir el título. Un `confirm()` se acepta por
 * reflejo tras el tercero seguido, y aquí no hay deshacer: es la única acción
 * de todo el CMS que destruye trabajo de forma irreversible.
 */
export function TrashActions({
  postId,
  title,
  restoreAction,
  purgeAction,
}: {
  postId: string;
  title: string;
  restoreAction: (postId: string) => Promise<void>;
  purgeAction: (postId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <label htmlFor={`purge-${postId}`} className="text-xs text-muted-foreground">
            Escribe el título para confirmar
          </label>
          <Input
            id={`purge-${postId}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={title}
            autoFocus
            className="mt-1 h-8 w-56 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={typed.trim() !== title.trim() || Boolean(pending)}
          onClick={() => startTransition(async () => purgeAction(postId))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Borrar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(pending)}
        onClick={() => startTransition(async () => restoreAction(postId))}
      >
        <RotateCcw className="size-4" />
        Restaurar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        Borrar
      </Button>
    </div>
  );
}
