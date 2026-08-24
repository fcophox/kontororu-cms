import StarterKit from "@tiptap/starter-kit";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Node, mergeAttributes } from "@tiptap/core";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

/**
 * Subconjunto de lenguajes en lugar de `common`.
 *
 * `createLowlight(common)` incluye ~35 gramáticas y añadía ~110 kB al bundle
 * del editor. Estas siete cubren lo que de verdad se pega en un CMS de
 * agencia; el resto cae a texto plano, que es una degradación aceptable.
 * Añadir uno nuevo es una línea.
 */
const lowlight = createLowlight({
  bash,
  css,
  json,
  python,
  sql,
  typescript,
  xml, // cubre HTML
});

/**
 * Callout: bloque destacado (info / warn / success / danger).
 * Se serializa a HTML semántico para que el front-end del cliente pueda
 * estilarlo con sus propias clases sin parsear el JSON.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-variant") ?? "info",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "kntr-callout" }),
      0,
    ];
  },
});

/*
 * `mediaId` es lo que hace que las imágenes no caduquen.
 *
 * El `src` de una imagen es una URL FIRMADA con caducidad. Guardarla en el
 * documento significa que, pasado su plazo, todas las imágenes de todo el
 * contenido publicado dejan de cargar en la web del cliente — sin ningún
 * error visible desde el CMS.
 *
 * Guardando además el id, el `src` pasa a ser desechable: la API vuelve a
 * firmar cada imagen en el momento de servirla.
 */
type KntrImageOptions = ImageOptions & { tenantId: string };

export const ImageBase = Image.extend<KntrImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      /*
       * El nodeview necesita saber a qué tenant sube el reemplazo. Viaja como
       * opción de la extensión porque el editor la conoce al crearse y el
       * nodeview no tiene otra vía hasta el árbol de React.
       */
      tenantId: "",
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-media-id"),
        renderHTML: (attrs) =>
          attrs.mediaId ? { "data-media-id": attrs.mediaId as string } : {},
      },
    };
  },
});

/** Opciones compartidas por la versión de servidor y la del editor. */
export const imageOptions = {
  inline: false,
  allowBase64: false, // todo pasa por Storage: nada de data: URIs en la BD
  HTMLAttributes: { class: "kntr-image", loading: "lazy" },
} as const;

/**
 * Versión sin nodeview: es la que usa el render a HTML en servidor, que sólo
 * necesita el esquema. La del editor vive en `client-extensions.ts`.
 */
export const KntrImage = ImageBase.configure(imageOptions);

export const editorExtensions = [
  StarterKit.configure({
    codeBlock: false, // lo reemplaza CodeBlockLowlight
    heading: { levels: [2, 3, 4] },
  }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: "typescript" }),
  KntrImage,
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ["http", "https", "mailto"],
    HTMLAttributes: { rel: "noopener noreferrer nofollow" },
  }),
  Youtube.configure({ controls: true, nocookie: true, modestBranding: true }),
  Placeholder.configure({ placeholder: "Escribe o pega contenido…" }),
  Callout,
];
