"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PortfolioItem } from "@/lib/addons/portfolio";
import { AddonDrawer } from "./addon-drawer";
import type { PortfolioState } from "./actions";

type ItemImage = { url: string; mediaId: string };

/**
 * Drawer del elemento del portfolio: el mismo formulario crea y edita.
 *
 * La imagen NO viaja con el formulario: se sube en cuanto se elige, contra el
 * mismo endpoint que usa el editor —que valida MIME, tamaño y cuota del plan—
 * y al enviar sólo van la URL y el id de la mediateca. Así el elemento se
 * guarda con una imagen que ya sabemos que existe, y quien la elige ve si ha
 * entrado antes de rellenar el resto.
 *
 * Es controlado: quien lo abre decide sobre qué elemento. La rejilla necesita
 * abrirlo desde cada tarjeta, y un drawer con su propio estado interno
 * obligaría a montar uno por trabajo.
 */
export function PortfolioItemDrawer({
  tenantId,
  categories,
  item,
  onClose,
  submitAction,
}: {
  tenantId: string;
  /** Las categorías ya usadas, para sugerirlas y no reescribirlas a mano. */
  categories: string[];
  /** El elemento a editar, o `undefined` para uno nuevo. */
  item?: PortfolioItem;
  onClose: () => void;
  submitAction: (prev: PortfolioState, formData: FormData) => Promise<PortfolioState>;
}) {
  const isEditing = item !== undefined;

  const [image, setImage] = useState<ItemImage | null>(
    item?.imageUrl ? { url: item.imageUrl, mediaId: item.imageMediaId } : null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isSaving] = useActionState<PortfolioState, FormData>(
    submitAction,
    {},
  );

  // Guardado: el drawer se va y la rejilla de detrás ya está al día.
  useEffect(() => {
    if (state.ok) onClose();
    // `onClose` fuera de las dependencias a propósito: llega sin memorizar
    // desde la rejilla, y volvería a cerrar en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const upload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("tenantId", tenantId);

      const res = await fetch("/api/media/upload", { method: "POST", body });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error ?? "No se pudo subir la imagen.");
      }
      const media: { id: string; url: string } = await res.json();
      setImage({ url: media.url, mediaId: media.id });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setIsUploading(false);
      // El input se limpia para que volver a elegir el MISMO archivo tras un
      // error vuelva a disparar `change`.
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const isBusy = isSaving || isUploading;

  return (
    <AddonDrawer
      title={isEditing ? "Editar elemento" : "Nuevo elemento"}
      isBusy={isBusy}
      onClose={onClose}
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        {isEditing && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="imageUrl" value={image?.url ?? ""} />
        <input type="hidden" name="imageMediaId" value={image?.mediaId ?? ""} />

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label>Imagen</Label>

            {image ? (
              <div className="relative overflow-hidden rounded-[var(--radius)] border">
                {/* `unoptimized`: la URL viene firmada y caduca, así que el
                    optimizador la cachearía ya rota. */}
                <Image
                  src={image.url}
                  alt=""
                  width={640}
                  height={360}
                  unoptimized
                  className="h-40 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="Quitar imagen"
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-[var(--radius)] bg-background/80 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <ImagePlus className="size-6 opacity-40" />
                )}
                {isUploading ? "Subiendo…" : "Elegir una imagen"}
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolio-title">Título</Label>
            <Input
              id="portfolio-title"
              name="title"
              required
              maxLength={120}
              defaultValue={item?.title ?? ""}
              placeholder="Nombre del trabajo"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolio-description">Descripción</Label>
            <Textarea
              id="portfolio-description"
              name="description"
              rows={4}
              maxLength={600}
              defaultValue={item?.description ?? ""}
              placeholder="Qué es, para quién y qué hiciste."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolio-external-url">URL externa</Label>
            <Input
              id="portfolio-external-url"
              name="externalUrl"
              type="url"
              defaultValue={item?.externalUrl ?? ""}
              placeholder="https://…"
            />
            <p className="text-xs text-muted-foreground">
              Opcional: el sitio donde vive el trabajo publicado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolio-category">Categoría</Label>
            <Input
              id="portfolio-category"
              name="category"
              maxLength={60}
              list="portfolio-categories"
              defaultValue={item?.category ?? ""}
              placeholder="Fotografía, Identidad, Web…"
            />
            <datalist id="portfolio-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </div>

        <footer className="border-t p-4">
          <Button type="submit" className="w-full" disabled={isBusy}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear elemento"}
          </Button>
        </footer>
      </form>
    </AddonDrawer>
  );
}

/** El botón de la cabecera y el drawer vacío que abre. */
export function PortfolioCreateButton({
  tenantId,
  categories,
  createAction,
}: {
  tenantId: string;
  categories: string[];
  createAction: (prev: PortfolioState, formData: FormData) => Promise<PortfolioState>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        Crear elemento
      </Button>

      {/* Montar el drawer sólo al abrirlo es lo que devuelve el formulario a
          su estado inicial entre dos creaciones seguidas. */}
      {isOpen && (
        <PortfolioItemDrawer
          tenantId={tenantId}
          categories={categories}
          onClose={() => setIsOpen(false)}
          submitAction={createAction}
        />
      )}
    </>
  );
}
