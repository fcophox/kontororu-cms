"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { JSONContent } from "@tiptap/react";
import { Loader2, Check, AlertCircle, UploadCloud, Trash, ArrowLeft } from "lucide-react";
import { TiptapEditor, type EditorPayload } from "./tiptap-editor";
import { CustomFieldsEditor } from "./custom-fields-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localeLabel } from "@/lib/content/locales";
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
  coverMediaId?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
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
  /** El editor de la URL/slug del post. */
  slugEditor?: React.ReactNode;
  /** Sólo en edición: un contenido sin guardar aún no tiene URL ni papelera. */
  lifecycle?: React.ReactNode;
  /** Sólo en edición: un contenido nuevo no tiene versiones anteriores. */
  history?: React.ReactNode;
  /** Sólo si el espacio tiene más de un idioma. */
  translations?: React.ReactNode;
  /** Pestañas de idioma sobre el cuerpo del editor. */
  localeTabs?: React.ReactNode;
  /** Sólo con el complemento Reacciones activo y el contenido ya guardado. */
  reactions?: React.ReactNode;
  /**
   * Idiomas a los que alcanza Publicar. Publicar arrastra al grupo entero, y
   * eso tiene que verse ANTES de pulsar: de lo contrario se publica una
   * traducción automática sin querer.
   */
  publishLocales?: string[];
};

export function PostEditor({
  tenantId,
  tenantSlug,
  draft,
  categories,
  canPublish,
  saveAction,
  onPublish,
  onUnpublish,
  slugEditor,
  lifecycle,
  history,
  translations,
  localeTabs,
  reactions,
  publishLocales = [],
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
  const [publishedAt, setPublishedAt] = useState<string>(
    draft.publishedAt ? formatDatetimeLocal(draft.publishedAt) : ""
  );
  const [activeTab, setActiveTab] = useState<"general" | "history" | "metadata">("general");

  // Una traducción automática reescribe el cuerpo en servidor. Tiptap sólo lee
  // `content` al crearse, y este componente guarda el suyo en estado: sin
  // resincronizar, el editor seguiría mostrando —y Guardar seguiría enviando—
  // el texto anterior a traducir. Comparar la identidad del prop basta: sólo
  // cambia cuando el servidor devuelve contenido nuevo, no al teclear.
  const [syncedContent, setSyncedContent] = useState(draft.contentJson);
  const [syncedContentKey, setSyncedContentKey] = useState(0);
  if (syncedContent !== draft.contentJson) {
    setSyncedContent(draft.contentJson);
    setSyncedContentKey((n) => n + 1);
    setContent({ json: draft.contentJson, html: "" });
    setDirty(false);
  }

  const [coverMediaId, setCoverMediaId] = useState<string | null>(draft.coverMediaId ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(draft.coverUrl ?? null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCover(true);
    setCoverError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("tenantId", tenantId);

      const res = await fetch("/api/media/upload", { method: "POST", body });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Error al subir la imagen" }));
        throw new Error(error ?? "Error al subir la imagen");
      }

      const media = await res.json();
      setCoverMediaId(media.id);
      setCoverUrl(media.url);
      setDirty(true);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleRemoveCover = () => {
    setCoverMediaId(null);
    setCoverUrl(null);
    setDirty(true);
  };

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
    <div className="flex h-full flex-col overflow-hidden">
      <form id={formId} action={formAction}>
        <input type="hidden" name="postId" value={draft.id ?? ""} />
        <input type="hidden" name="contentJson" value={JSON.stringify(content.json)} />
        <input type="hidden" name="customFields" value={JSON.stringify(customFields)} />
        <input type="hidden" name="seo" value={JSON.stringify(draft.seo)} />
        <input type="hidden" name="coverMediaId" value={coverMediaId ?? ""} />
        <input
          type="hidden"
          name="publishedAt"
          value={publishedAt && !isNaN(new Date(publishedAt).getTime()) ? new Date(publishedAt).toISOString() : ""}
        />

        <header className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 px-8 py-3 backdrop-blur">
          <Button variant="outline" size="icon" asChild className="size-8">
            <Link href={`/${tenantSlug}/content`} title="Volver a Contenido">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>

          <div className="min-w-0 flex-1">
            <Input
              // Sin `key`, el input no descartaría su valor anterior cuando el
              // servidor devuelve un título traducido.
              key={draft.title}
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
            <div className="flex items-center gap-2">
              {publishLocales.length > 1 && (
                <span
                  className="hidden text-xs text-muted-foreground sm:inline"
                  title={publishLocales.map(localeLabel).join(", ")}
                >
                  {draft.status === "PUBLISHED" ? "Retira" : "Publica"}{" "}
                  {publishLocales.length} idiomas
                </span>
              )}
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
            </div>
          )}
        </header>
      </form>

      {state.error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-8 py-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {state.error}
        </div>
      )}

      <div className="flex flex-1 gap-8 px-8 pb-8 pt-4 overflow-hidden">
        <div className="min-w-0 flex-1 h-full overflow-y-auto pr-4 max-w-3xl mx-auto">
          {localeTabs}
          <TiptapEditor
            // Remonta el editor cuando el contenido llega traducido de servidor.
            key={syncedContentKey}
            tenantId={tenantId}
            initialContent={draft.contentJson}
            onChange={handleChange}
          />
        </div>

        <aside className="w-80 shrink-0 flex flex-col h-full overflow-hidden bg-transparent">
          {/* Cabecera de Tabs */}
          <div className="flex border-b border-border/80 px-2 shrink-0 bg-transparent gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`flex-1 pb-2 pt-2.5 text-center text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                activeTab === "general"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex-1 pb-2 pt-2.5 text-center text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                activeTab === "history"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              Historial
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("metadata")}
              className={`flex-1 pb-2 pt-2.5 text-center text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                activeTab === "metadata"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              Metadatos
            </button>
          </div>

          {/* Contenido de la pestaña activa */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 pr-2 scrollbar-thin">
            {activeTab === "general" && (
              <div className="space-y-6">
                <section className="space-y-2">
                  <Label htmlFor="categoryId">Categoría</Label>
                  <select
                    id="categoryId"
                    // Sin `key`, el select no reflejaba la categoría recién
                    // guardada: es un campo no controlado, y al refrescar el
                    // servidor con el nuevo `draft.categoryId` React no vuelve
                    // a aplicar `defaultValue` sobre el mismo nodo. El usuario
                    // veía "Sin categoría" tras guardar aunque sí se hubiera
                    // asignado — sólo se corregía al recargar la página.
                    key={draft.categoryId ?? "none"}
                    name="categoryId"
                    form={formId}
                    defaultValue={draft.categoryId ?? ""}
                    onChange={() => setDirty(true)}
                    className="h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-[size:16px_auto] bg-no-repeat pr-8"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </section>

                {/* La URL va pegada a la categoría: las dos responden a "dónde
                    vive esto", y buscarla al final de la columna —tras portada,
                    fecha y extracto— obligaba a bajar por todo el panel para
                    comprobar una dirección. */}
                {slugEditor}

                <section className="space-y-2">
                  <Label>Imagen de portada</Label>
                  {coverUrl ? (
                    <div className="relative group overflow-hidden rounded-[var(--radius)] border bg-muted aspect-video">
                      <Image
                        src={coverUrl}
                        alt="Vista previa de portada"
                        fill
                        unoptimized /* la URL firmada caduca: optimizarla la cachearía rota */
                        className="object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={handleRemoveCover}
                          className="gap-1.5"
                        >
                          <Trash className="size-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-[var(--radius)] p-4 hover:bg-muted/50 cursor-pointer relative group transition-colors duration-200 min-h-24">
                      {isUploadingCover ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Subiendo...</span>
                        </div>
                      ) : (
                        <>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCoverUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="flex flex-col items-center gap-1">
                            <UploadCloud className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                              Subir portada
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              PNG, JPG, WebP hasta 5MB
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {coverError && (
                    <p className="text-[11px] text-destructive mt-1">{coverError}</p>
                  )}
                  {/* Se avisa aquí y no en la ayuda: quien cambia la portada
                      tiene que saber en ese momento que afecta a los demás
                      idiomas, no descubrirlo al revisar la web. */}
                  <p className="text-[10px] text-muted-foreground">
                    La portada es la misma en todos los idiomas.
                  </p>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="publishedAtInput">Fecha de publicación</Label>
                    {publishedAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setPublishedAt("");
                          setDirty(true);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                  <Input
                    id="publishedAtInput"
                    type="datetime-local"
                    value={publishedAt}
                    onChange={(e) => {
                      setPublishedAt(e.target.value);
                      setDirty(true);
                    }}
                    className="relative w-full cursor-pointer text-xs font-medium pl-8 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-2.5 [&::-webkit-calendar-picker-indicator]:opacity-50"
                  />
                  {!publishedAt && (
                    <p className="text-[10px] text-muted-foreground">
                      Por defecto se fijará al momento de presionar &quot;Publicar&quot;.
                    </p>
                  )}
                </section>

                <section className="space-y-2">
                  <Label htmlFor="excerpt">Extracto</Label>
                  <Textarea
                    // Mismo motivo que el título: sin `key`, el textarea se
                    // quedaría con el extracto anterior cuando el servidor
                    // devuelve el traducido. Si no hay extracto, la clave no
                    // cambia y aquí no pasa nada.
                    key={draft.excerpt}
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

                {reactions}
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-6">
                {history}
                {lifecycle}
              </div>
            )}

            {activeTab === "metadata" && (
              <div className="space-y-6">
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
              </div>
            )}
          </div>
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

function formatDatetimeLocal(isoString?: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
