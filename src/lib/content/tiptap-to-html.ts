import "server-only";

import { generateHTML } from "@tiptap/html";
// generateText vive en core, no en el paquete de HTML.
import { generateText } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import DOMPurify from "isomorphic-dompurify";
import { editorExtensions } from "@/components/editor/extensions";

/**
 * Convierte la salida del editor a HTML listo para la API.
 *
 * Se ejecuta AL GUARDAR, no al leer: renderizar en cada request de la API
 * pública multiplicaría por lectura un coste que sólo cambia por publicación.
 *
 * El sanitizado ocurre aquí, en servidor, y no en el editor. El editor es
 * conveniencia de UI; cualquiera puede hacer un POST directo a la Server
 * Action con un `content_json` fabricado. La frontera de confianza es esta
 * función, y es la única.
 */

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "s", "code", "pre", "blockquote",
  "h2", "h3", "h4", "ul", "ol", "li",
  "a", "img", "figure", "figcaption", "hr", "div", "span", "iframe",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "src", "alt", "title", "width", "height", "loading",
  "class", "data-type", "data-variant", "data-language",
  "allowfullscreen", "frameborder", "allow",
];

export function renderContent(json: JSONContent): { html: string; text: string } {
  const raw = generateHTML(json, editorExtensions);
  const text = generateText(json, editorExtensions);

  const html = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Allowlist de esquemas: bloquea javascript: y data: en href/src.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/))/i,
    ADD_TAGS: ["iframe"], // embeds de YouTube
    FORBID_TAGS: ["script", "style", "form", "input", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "style", "srcdoc"],
  });

  return { html, text };
}

/**
 * Los embeds sólo pueden apuntar a proveedores conocidos. Sin esto, un
 * `<iframe src="https://atacante.com">` sobreviviría al sanitizado —
 * DOMPurify valida el esquema, no el destino.
 */
const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
];

export function assertSafeEmbeds(html: string): void {
  const srcs = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);

  for (const src of srcs) {
    let host: string;
    try {
      host = new URL(src, "https://placeholder.invalid").hostname;
    } catch {
      throw new Error(`Embed con URL inválida: ${src}`);
    }
    if (!ALLOWED_IFRAME_HOSTS.includes(host)) {
      throw new Error(`Proveedor de embed no permitido: ${host}`);
    }
  }
}
