import "server-only";

import translate from "google-translate-api-x";
import type { JSONContent } from "@tiptap/react";

/**
 * Traducción automática de contenido.
 *
 * Se traduce el ÁRBOL de Tiptap, no el HTML renderizado: el editor lee
 * `content_json`, así que traducir sólo el HTML dejaría el cuerpo en el idioma
 * original en cuanto alguien abriese la entrada. Recorriendo el JSON se
 * conserva intacta la estructura —encabezados, listas, imágenes, embeds,
 * enlaces— y sólo cambia lo que es prosa.
 *
 * Es un punto de partida, no una publicación: el resultado se guarda siempre
 * en BORRADOR para que alguien lo revise antes de que salga a la web.
 */

/** Nodos cuyo texto es código o marcado, no prosa: traducirlos lo rompería. */
const OPAQUE_NODES = new Set(["codeBlock", "code"]);

/**
 * Atributos que son prosa aunque no sean nodos de texto.
 *
 * El pie de una imagen se lee en la página igual que un párrafo, pero vive en
 * `attrs` y no en el árbol: recorriendo sólo los nodos de texto, la versión en
 * inglés salía con los pies en español y nadie lo veía hasta publicar. Lo
 * mismo vale para el `alt`, que es lo que oye quien navega con lector de
 * pantalla, y para el `title`.
 *
 * La lista es una allowlist a propósito: `src` o `mediaId` también son
 * cadenas, y traducirlos rompería la imagen.
 */
const TRANSLATABLE_ATTRS: Record<string, readonly string[]> = {
  image: ["caption", "alt", "title"],
};

/**
 * El servicio corta las peticiones muy grandes. Un artículo largo se manda por
 * tandas en vez de en un único lote que fallaría entero.
 */
const BATCH_SIZE = 40;

export async function translateText(text: string, to = "en"): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const result = await translate(trimmed, { to });
  return (result as { text: string }).text;
}

/**
 * Traduce una lista de cadenas conservando el orden.
 *
 * Los espacios de los extremos se separan antes de traducir y se vuelven a
 * pegar después: el traductor los normaliza, y perderlos junta palabras que
 * estaban separadas por marcas (`<strong>hola</strong> mundo`).
 */
async function translateBatch(texts: string[], to: string): Promise<string[]> {
  const out: string[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const parts = chunk.map((t) => {
      const match = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return {
        leading: match?.[1] ?? "",
        core: match?.[2] ?? t,
        trailing: match?.[3] ?? "",
      };
    });

    const cores = parts.map((p) => p.core);
    const translated = await translate(cores, { to });
    const values = Array.isArray(translated)
      ? translated.map((t) => (t as { text: string }).text)
      : [(translated as { text: string }).text];

    parts.forEach((p, index) => {
      out.push(`${p.leading}${values[index] ?? p.core}${p.trailing}`);
    });
  }

  return out;
}

/** Un hueco de prosa dentro del documento, sea un nodo de texto o un atributo. */
type TextRef = {
  read: () => string;
  write: (value: string) => void;
};

function collectTranslatable(node: JSONContent, acc: TextRef[]): void {
  if (node.type && OPAQUE_NODES.has(node.type)) return;

  if (typeof node.text === "string" && /\S/.test(node.text)) {
    acc.push({
      read: () => node.text as string,
      write: (value) => {
        node.text = value;
      },
    });
  }

  const attrs = node.attrs;
  if (attrs && node.type) {
    for (const key of TRANSLATABLE_ATTRS[node.type] ?? []) {
      const value = attrs[key];
      if (typeof value === "string" && /\S/.test(value)) {
        acc.push({
          read: () => attrs[key] as string,
          write: (translated) => {
            attrs[key] = translated;
          },
        });
      }
    }
  }

  for (const child of node.content ?? []) {
    collectTranslatable(child, acc);
  }
}

/**
 * Devuelve una copia del documento con el texto traducido.
 *
 * El original no se toca: si la traducción falla a medias, el contenido de
 * partida sigue intacto.
 */
export async function translateJsonContent(
  json: JSONContent,
  to = "en",
): Promise<JSONContent> {
  const copy: JSONContent = JSON.parse(JSON.stringify(json));

  const refs: TextRef[] = [];
  collectTranslatable(copy, refs);
  if (refs.length === 0) return copy;

  const translated = await translateBatch(
    refs.map((ref) => ref.read()),
    to,
  );

  refs.forEach((ref, index) => {
    ref.write(translated[index] ?? ref.read());
  });

  return copy;
}
