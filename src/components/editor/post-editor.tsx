"use client";

import { useActionState, useState, useTransition } from "react";
import type { JSONContent } from "@tiptap/react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { TiptapEditor, type EditorPayload } from "./tiptap-editor";
import { CustomFieldsEditor } from "./custom-fields-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/app/(dashboard)/[tenantSlug]/content/actions";

export type PostDraft = {
  id?: string;
  title: string;
  slug?: string;
  excerpt: string;
  categoryId: string | null;
  contentJson: JSONContent;
  customFields: Record<string, unknown>;
  seo: { title?: string; description?: string };
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

type Props = {
  tenantId: string;
  tenantSlug: string;
  draft: PostDraft;
  categories: { id: string; name: string }[];
  canPublish: boolean;
  saveAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onPublish?: () => Promise<void>;
  onUnpublish?: () => Promise<void>;
  /** Sólo en edición: un contenido sin guardar aún no tiene URL ni papelera. */
  lifecycle?: React.ReactNode;
  /** Sólo en edición: un contenido nuevo no tiene versiones anteriores. */
  history?: React.ReactNode;
  /** Sólo si el espacio tiene más de un idioma. */
  translations?: React.ReactNode;
};

export function PostEditor({
  tenantId,
  draft,
  categories,
  canPublish,
  saveAction,
  onPublish,
  onUnpublish,
  lifecycle,
  history,
  translations,
}: Props) {
  const [state, formAction, isSaving] = useActionState<ActionState, FormData>(
    saveAction,
    {},
  );
  const [isTransitioning, startTransition] = useTransition();

  // El contenido del editor no es un <input>: se sincroniza a un campo oculto
  // para que viaje en el FormData de la Server Action.
  const [content, setContent] = useState<EditorPayload>({
    json: draft.contentJson,
    html: "",
  });
  const [customFields, setCustomFields] = useState(draft.customFields);
  const [dirty, setDirty] = useState(false);

  const handleChange = (payload: EditorPayload) => {
    setContent(payload);
    setDirty(true);
  };

  // Los campos de la barra lateral se asocian al formulario por `form=` en
  // vez de estar dentro de él. Así el bloque de ciclo de vida puede tener su
  // propio <form> —para la URL— sin anidar formularios, que es HTML inválido
  // y haría que Guardar disparase también ese cambio.
  const formId = "post-editor-form";

  return (
    <div className="flex min-h-svh flex-col">
      <form id={formId} action={formAction}>
        <input type="hidden" name="postId" value={draft.id ?? ""} />
        <input type="hidden" name="contentJson" value={JSON.stringify(content.json)} />
        <input type="hidden" name="customFields" value={JSON.stringify(customFields)} />
        <input type="hidden" name="seo" value={JSON.stringify(draft.seo)} />

        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-8 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <Input
              name="title"
              defaultValue={draft.title}
              onChange={() => setDirty(true)}
              placeholder="Título de la entrada"
              required
              maxLength={200}
              aria-invalid={Boolean(state.fieldErrors?.title)}
              className="h-auto border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
            />
            {draft.slug && (
              <p className="mt-0.5 text-xs text-muted-foreground">/{draft.slug}</p>
            )}
          </div>

          <SaveIndicator isSaving={isSaving} error={state.error} dirty={dirty} />

          <Button type="submit" variant="outline" size="sm" disabled={isSaving}>
            Guardar
          </Button>

          {canPublish && draft.id && (
            <Button
              type="button"
              size="sm"
              disabled={isTransitioning}
              onClick={() =>
                startTransition(async () => {
                  if (draft.status === "PUBLISHED") await onUnpublish?.();
                  else await onPublish?.();
                })
              }
            >
              {isTransitioning && <Loader2 className="size-4 animate-spin" />}
              {draft.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
            </Button>
          )}
        </header>
      </form>

      {state.error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-8 py-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {state.error}
        </div>
      )}

      <div className="flex flex-1 gap-8 p-8">
        <div className="min-w-0 flex-1">
          <TiptapEditor
            tenantId={tenantId}
            initialContent={draft.contentJson}
            onChange={handleChange}
          />
        </div>

        <aside className="w-72 shrink-0 space-y-6">
          <section className="space-y-2">
            <Label htmlFor="categoryId">Categoría</Label>
            <select
              id="categoryId"
              name="categoryId"
              form={formId}
              defaultValue={draft.categoryId ?? ""}
              onChange={() => setDirty(true)}
              className="h-9 w-full rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <Label htmlFor="excerpt">Extracto</Label>
            <Textarea
              id="excerpt"
              name="excerpt"
              form={formId}
              defaultValue={draft.excerpt}
              onChange={() => setDirty(true)}
              maxLength={400}
              rows={3}
              placeholder="Resumen breve para listados y redes sociales."
            />
          </section>

          {translations}

          {lifecycle}

          {history}

          <section className="space-y-2">
            <Label>Campos personalizados</Label>
            <p className="text-xs text-muted-foreground">
              Metadatos libres que viajan en la API dentro de{" "}
              <code className="rounded bg-muted px-1">custom_fields</code>.
            </p>
            <CustomFieldsEditor
              value={customFields}
              onChange={(next) => {
                setCustomFields(next);
                setDirty(true);
              }}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function SaveIndicator({
  isSaving,
  error,
  dirty,
}: {
  isSaving: boolean;
  error?: string;
  dirty: boolean;
}) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Guardando…
      </span>
    );
  }
  if (error) return null;
  if (dirty) {
    return <span className="text-xs text-muted-foreground">Cambios sin guardar</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5" />
      Guardado
    </span>
  );
}
