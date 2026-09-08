"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";

export type UploadedMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

/**
 * Sube al Storage del tenant vía route handler (nunca directo desde el
 * cliente: el servidor valida MIME, tamaño, cuota y registra en `media`).
 */
export async function uploadMedia(file: File, tenantId: string): Promise<UploadedMedia> {
  const body = new FormData();
  body.append("file", file);
  body.append("tenantId", tenantId);

  const res = await fetch("/api/media/upload", { method: "POST", body });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error ?? "Error al subir el archivo");
  }
  return res.json();
}

/**
 * Inserta primero un placeholder optimista y lo sustituye por la URL final,
 * para que pegar/arrastrar una imagen se sienta instantáneo.
 */
export function useMediaUpload(editor: Editor | null, tenantId: string) {
  const upload = useCallback(
    (file: File) => uploadMedia(file, tenantId),
    [tenantId],
  );

  const insertFiles = useCallback(
    async (files: File[]) => {
      if (!editor) return;

      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;

        const localUrl = URL.createObjectURL(file);
        editor.chain().focus().setImage({ src: localUrl, alt: file.name }).run();

        try {
          const media = await upload(file);
          replaceImageSrc(editor, localUrl, media.url, media.id);
        } catch (err) {
          replaceImageSrc(editor, localUrl, null);
          console.error(err);
        } finally {
          URL.revokeObjectURL(localUrl);
        }
      }
    },
    [editor, upload],
  );

  return { upload, insertFiles };
}

/**
 * Sustituye (o elimina, si `next` es null) el nodo imagen con ese src.
 *
 * Junto al src se guarda `mediaId`: el src caduca, el id no. Es lo que
 * permite volver a firmar la imagen al servirla.
 */
function replaceImageSrc(
  editor: Editor,
  current: string,
  next: string | null,
  mediaId?: string,
) {
  const { state, view } = editor;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "image" || node.attrs.src !== current) return;
    const tr = next
      ? state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: next, mediaId })
      : state.tr.delete(pos, pos + node.nodeSize);
    view.dispatch(tr);
    return false;
  });
}
