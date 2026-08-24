"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ImageIcon, Pencil, Replace, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ImageBase, imageOptions } from "./extensions";
import { uploadMedia } from "./use-media-upload";

/**
 * Imagen con controles: `alt`, `title`, reemplazo y borrado.
 *
 * Vive aparte de `extensions.ts` porque ese módulo también lo consume el
 * render a HTML en servidor, que no puede arrastrar componentes de React.
 * Allí queda el esquema; aquí, la interfaz.
 */
export const KntrImageWithControls = ImageBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure(imageOptions);

function ImageNodeView({ node, updateAttributes, deleteNode, selected, extension }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null };

  return (
    <NodeViewWrapper
      as="figure"
      className={cn(
        "group relative my-4 w-fit max-w-full rounded-[var(--radius)]",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? ""} title={title ?? undefined} className="kntr-image !my-0" />

      {/* Un alt vacío no se ve en la página, pero sí se nota en quien navega
          con lector de pantalla. Se avisa aquí, mientras aún se puede. */}
      {!alt && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-[var(--radius)] bg-warn-surface px-2 py-1 text-xs font-medium text-warn shadow-xs">
          <TriangleAlert className="size-3.5" />
          Sin texto alternativo
        </span>
      )}

      <div
        className={cn(
          "absolute top-2 right-2 transition-opacity",
          "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          selected && "opacity-100",
        )}
        contentEditable={false}
      >
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="cursor-pointer shadow-xs"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="size-4" />
          Editar imagen
        </Button>
      </div>

      {isEditing && (
        <ImageDialog
          src={src}
          alt={alt ?? ""}
          title={title ?? ""}
          tenantId={(extension.options as { tenantId: string }).tenantId}
          onSave={(attrs) => {
            updateAttributes(attrs);
            setIsEditing(false);
          }}
          onDelete={() => {
            setIsEditing(false);
            deleteNode();
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

type ImageAttrs = { alt: string; title: string; src?: string; mediaId?: string };

function ImageDialog({
  src,
  alt,
  title,
  tenantId,
  onSave,
  onDelete,
  onCancel,
}: {
  src: string;
  alt: string;
  title: string;
  tenantId: string;
  onSave: (attrs: ImageAttrs) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [altValue, setAltValue] = useState(alt);
  const [titleValue, setTitleValue] = useState(title);
  // El reemplazo se aplica al guardar, no al elegir el archivo: hasta
  // entonces «Cancelar» sigue significando que nada cambió.
  const [replacement, setReplacement] = useState<{ src: string; mediaId: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const altInput = useRef<HTMLInputElement>(null);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    altInput.current?.focus();
  }, [isMounted]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, isUploading]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // La preview local se revoca al desmontar, no al terminar la subida: sigue
  // siendo lo que se ve en el diálogo mientras dura.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!isMounted) return null;

  const handleReplace = async (file: File) => {
    setError(null);
    setIsUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return localUrl;
    });
    try {
      const media = await uploadMedia(file, tenantId);
      setReplacement({ src: media.url, mediaId: media.id });
    } catch (err) {
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      setError(err instanceof Error ? err.message : "Error al subir el archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    onSave({
      alt: altValue.trim(),
      title: titleValue.trim(),
      ...(replacement ?? {}),
    });
  };

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-xs animate-backdrop-in"
        onClick={() => {
          if (!isUploading) onCancel();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-dialog-title"
        className="relative w-full max-w-[480px] overflow-hidden rounded-[var(--radius)] border border-border bg-card p-6 shadow-lg animate-modal-in focus:outline-hidden"
      >
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary dark:bg-primary/20">
            <ImageIcon className="size-5" />
          </div>
          <div className="flex-1 space-y-1.5">
            <h3
              id="image-dialog-title"
              className="text-base font-semibold leading-none tracking-tight text-foreground"
            >
              Imagen
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              El texto alternativo lo lee quien no ve la imagen; el título aparece
              al dejar el cursor encima.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="overflow-hidden rounded-[var(--radius)] border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview ?? src}
              alt=""
              className={cn(
                "mx-auto max-h-48 w-auto object-contain transition-opacity",
                isUploading && "opacity-50",
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-alt">Texto alternativo</Label>
            <Input
              id="image-alt"
              ref={altInput}
              value={altValue}
              placeholder="Qué se ve en la imagen"
              onChange={(e) => setAltValue(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-title">Título</Label>
            <Input
              id="image-title"
              value={titleValue}
              placeholder="Opcional"
              onChange={(e) => setTitleValue(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="mr-auto h-9 cursor-pointer px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isUploading}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            Eliminar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 cursor-pointer px-3"
            disabled={isUploading}
            onClick={() => fileInput.current?.click()}
          >
            <Replace className="size-4" />
            {isUploading ? "Subiendo…" : "Reemplazar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 cursor-pointer px-4"
            disabled={isUploading}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-9 min-w-[80px] cursor-pointer px-4"
            disabled={isUploading}
            onClick={handleSave}
          >
            Guardar
          </Button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleReplace(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
