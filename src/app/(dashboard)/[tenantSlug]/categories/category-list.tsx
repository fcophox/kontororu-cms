"use client";

import { useActionState, useTransition } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryState } from "./actions";

type Category = {
  id: string;
  name: string;
  slug: string;
  kindLabel: string;
  description: string | null;
  postCount: number;
};

export function CategoryList({
  categories,
  createAction,
  deleteAction,
}: {
  categories: Category[];
  createAction: (prev: CategoryState, formData: FormData) => Promise<CategoryState>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [state, formAction, isCreating] = useActionState<CategoryState, FormData>(
    createAction,
    {},
  );
  const [pendingId, startTransition] = useTransition();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {categories.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Todavía no hay categorías.
          </p>
        )}

        {categories.map((category) => (
          <div key={category.id} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{category.name}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                  {category.kindLabel}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                /{category.slug} · {category.postCount}{" "}
                {category.postCount === 1 ? "entrada" : "entradas"}
              </p>
              {category.description && (
                <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Eliminar ${category.name}`}
              disabled={Boolean(pendingId)}
              onClick={() => {
                const warning =
                  category.postCount > 0
                    ? `${category.postCount} entrada(s) quedarán sin categoría. ¿Eliminar "${category.name}"?`
                    : `¿Eliminar "${category.name}"?`;
                if (!window.confirm(warning)) return;
                startTransition(async () => {
                  await deleteAction(category.id);
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <form action={formAction} className="h-fit space-y-3 rounded-[var(--radius)] border bg-card p-4">
        <h2 className="font-medium">Nueva categoría</h2>

        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" required maxLength={80} placeholder="Casos de Estudio" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="kind">Tipo</Label>
          <select
            id="kind"
            name="kind"
            defaultValue="BLOG"
            className="h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-[size:16px_auto] bg-no-repeat pr-8"
          >
            <option value="BLOG">Blog</option>
            <option value="CASE_STUDY">Casos de Estudio</option>
            <option value="SERVICE">Servicios</option>
            <option value="CUSTOM">Personalizada</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" name="description" maxLength={300} />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={isCreating}>
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Crear categoría
        </Button>
      </form>
    </div>
  );
}
