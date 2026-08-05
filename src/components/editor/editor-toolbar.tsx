"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Code2, Heading2, Heading3, List, ListOrdered,
  Quote, ImageIcon, Youtube, Info, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";

export function EditorToolbar({
  editor,
  onPickFiles,
}: {
  editor: Editor | null;
  onPickFiles: (files: File[]) => void | Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
      <Toggle size="sm" pressed={editor.isActive("bold")} aria-label="Negrita"
        onPressedChange={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("italic")} aria-label="Cursiva"
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle size="sm" pressed={editor.isActive("heading", { level: 2 })} aria-label="Título 2"
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("heading", { level: 3 })} aria-label="Título 3"
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("bulletList")} aria-label="Lista"
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("orderedList")} aria-label="Lista numerada"
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("blockquote")} aria-label="Cita"
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("codeBlock")} aria-label="Bloque de código"
        onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="size-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("callout")} aria-label="Callout"
        onPressedChange={() => editor.chain().focus().toggleWrap("callout").run()}>
        <Info className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button size="sm" variant="ghost" aria-label="Insertar imagen"
        onClick={() => fileInput.current?.click()}>
        <ImageIcon className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" aria-label="Insertar vídeo"
        onClick={() => {
          const url = window.prompt("URL de YouTube");
          if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
        }}>
        <Youtube className="size-4" />
      </Button>

      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" aria-label="Deshacer"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Rehacer"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void onPickFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
