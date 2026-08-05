"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Upload, Trash2, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MediaItem = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  createdAt: string;
  url: string | null;
};

export function MediaGrid({
  tenantId,
  items,
  page,
  totalPages,
  basePath,
  saveAltAction,
  deleteAction,
}: {
  tenantId: string;
  items: MediaItem[];
  page: number;
  totalPages: number;
  basePath: string;
  saveAltAction: (mediaId: string, alt: string) => Promise<void>;
  deleteAction: (mediaId: string) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const upload = async (files: File[]) => {
    setError(null);
    setUploading(files.length);

    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      body.append("tenantId", tenantId);

      const res = await fetch("/api/media/upload", { method: "POST", body });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: res.statusText }));
        setError(msg ?? "Error al subir el archivo");
        break;
      }
      setUploading((n) => n - 1);
    }

    setUploading(0);
    // Recarga los datos del servidor: las URLs firmadas se generan allí.
    startTransition(() => window.location.reload());
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading > 0 ? `Subiendo ${uploading}…` : "Subir archivos"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf,video/mp4"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void upload(files);
          e.target.value = "";
        }}
      />

      {items.length === 0 ? (
        <p className="rounded-[var(--radius)] border bg-card p-12 text-center text-sm text-muted-foreground">
          Todavía no hay archivos. También puedes arrastrarlos directamente
          dentro del editor de contenido.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              saveAltAction={saveAltAction}
              deleteAction={deleteAction}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`${basePath}?page=${page - 1}`} className="hover:underline">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`${basePath}?page=${page + 1}`} className="hover:underline">
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function MediaCard({
  item,
  saveAltAction,
  deleteAction,
}: {
  item: MediaItem;
  saveAltAction: (mediaId: string, alt: string) => Promise<void>;
  deleteAction: (mediaId: string) => Promise<void>;
}) {
  const [alt, setAlt] = useState(item.altText);
  const [pending, startTransition] = useTransition();
  const isImage = item.mimeType.startsWith("image/");

  return (
    <li className="overflow-hidden rounded-[var(--radius)] border bg-card">
      <div className="relative grid aspect-square place-items-center bg-muted">
        {isImage && item.url ? (
          <Image
            src={item.url}
            alt={alt || "Sin texto alternativo"}
            fill
            unoptimized /* la URL firmada caduca: optimizarla la cachearía rota */
            sizes="(max-width: 640px) 50vw, 16vw"
            className="object-cover"
          />
        ) : (
          <FileText className="size-8 text-muted-foreground" />
        )}
      </div>

      <div className="space-y-1.5 p-2">
        <Input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => {
            if (alt === item.altText) return;
            startTransition(async () => {
              await saveAltAction(item.id, alt);
            });
          }}
          placeholder="Texto alternativo"
          aria-label="Texto alternativo"
          className="h-7 text-xs"
        />

        <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">
            {item.width && item.height ? `${item.width}×${item.height} · ` : ""}
            {formatBytes(item.sizeBytes)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Eliminar archivo"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("¿Eliminar este archivo? El contenido que lo use quedará con la imagen rota.")) return;
              startTransition(async () => {
                await deleteAction(item.id);
              });
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
