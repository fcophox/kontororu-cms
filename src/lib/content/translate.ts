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
 * enlaces— y sólo cambian los nodos de texto.
 *
 * Es un punto de partida, no una publicación: el resultado se guarda siempre
 * en BORRADOR para que alguien lo revise antes de que salga a la web.
 */

/** Nodos cuyo texto es código o marcado, no prosa: traducirlos lo rompería. */
const OPAQUE_NODES = new Set(["codeBlock", "code"]);

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

type TextRef = { node: JSONContent };

function collectTextNodes(node: JSONContent, acc: TextRef[]): void {
  if (node.type && OPAQUE_NODES.has(node.type)) return;

  if (typeof node.text === "string" && /\S/.test(node.text)) {
    acc.push({ node });
  }

  for (const child of node.content ?? []) {
    collectTextNodes(child, acc);
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
  collectTextNodes(copy, refs);
  if (refs.length === 0) return copy;

  const translated = await translateBatch(
    refs.map((r) => r.node.text as string),
    to,
  );

  refs.forEach((ref, index) => {
    ref.node.text = translated[index] ?? ref.node.text;
  });

  return copy;
}
