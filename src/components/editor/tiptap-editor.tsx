"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { buildEditorExtensions } from "./client-extensions";
import { useMediaUpload } from "./use-media-upload";
import { EditorToolbar } from "./editor-toolbar";

export type EditorPayload = {
  json: JSONContent;
  html: string;
};

export function TiptapEditor({
  tenantId,
  initialContent,
  editable = true,
  onChange,
}: {
  tenantId: string;
  initialContent?: JSONContent;
  editable?: boolean;
  /** Debounced: se llama ~600 ms después de la última pulsación. */
  onChange?: (payload: EditorPayload) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extensions = useMemo(() => buildEditorExtensions(tenantId), [tenantId]);

  const editor = useEditor({
    extensions,
    content: initialContent ?? { type: "doc", content: [] },
    editable,
    // Evita el mismatch de hidratación en App Router.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[24rem] focus:outline-none px-4 py-3",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFilesRef.current?.(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFilesRef.current?.(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onChange({ json: editor.getJSON(), html: editor.getHTML() });
      }, 600);
    },
  });

  // `editorProps` se congela en la creación; el ref mantiene el handler vivo.
  const { insertFiles } = useMediaUpload(editor, tenantId);
  const insertFilesRef = useRef(insertFiles);
  useEffect(() => {
    insertFilesRef.current = insertFiles;
  }, [insertFiles]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="rounded-[var(--radius)] border bg-card">
      {editable && <EditorToolbar editor={editor} onPickFiles={insertFiles} />}
      <EditorContent editor={editor} />
    </div>
  );
}
