import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests del recorrido del árbol de Tiptap al traducir.
 *
 * El traductor real sale a la red y devuelve texto distinto cada vez, así que
 * se sustituye por uno que marca lo que recibe. Lo que se comprueba aquí no es
 * la calidad de la traducción —eso es del servicio— sino que la estructura del
 * documento sobreviva: si el recorrido pierde un nodo o rompe una marca, el
 * contenido llega mutilado al editor y nadie se entera hasta abrirlo.
 */

const calls: string[][] = [];

vi.mock("google-translate-api-x", () => ({
  default: async (input: string | string[]) => {
    const texts = Array.isArray(input) ? input : [input];
    calls.push(texts);
    const mark = (t: string) => ({ text: `[${t}]` });
    return Array.isArray(input) ? texts.map(mark) : mark(texts[0]);
  },
}));

const { translateJsonContent, translateText } = await import("@/lib/content/translate");

beforeEach(() => {
  calls.length = 0;
});

describe("translateJsonContent", () => {
  it("traduce el texto y deja intactos los nodos y sus marcas", async () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hola " },
            { type: "text", marks: [{ type: "bold" }], text: "mundo" },
          ],
        },
        { type: "image", attrs: { src: "https://example.com/a.png" } },
      ],
    };

    const out = await translateJsonContent(doc, "en");

    expect(out.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "[Título]" }],
    });
    expect(out.content?.[1].content?.[1]).toMatchObject({
      marks: [{ type: "bold" }],
      text: "[mundo]",
    });
    // El nodo sin prosa pasa tal cual: traducir un src rompería la imagen.
    expect(out.content?.[2]).toEqual(doc.content[2]);
  });

  it("traduce el pie, el alt y el title de una imagen", async () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://example.com/a.png",
            mediaId: "abc-123",
            caption: "Foto: Ana",
            alt: "Un gato",
            title: "Gato",
          },
        },
      ],
    };

    const out = await translateJsonContent(doc, "en");

    expect(out.content?.[0].attrs).toEqual({
      // Lo que identifica a la imagen no se toca: sólo cambia lo que se lee.
      src: "https://example.com/a.png",
      mediaId: "abc-123",
      caption: "[Foto: Ana]",
      alt: "[Un gato]",
      title: "[Gato]",
    });
  });

  it("no llama al servicio por una imagen sin pie ni alt", async () => {
    const doc = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://example.com/a.png", caption: null, alt: "" } },
      ],
    };

    const out = await translateJsonContent(doc, "en");
    expect(out).toEqual(doc);
    expect(calls).toHaveLength(0);
  });

  it("conserva los espacios de los extremos entre marcas", async () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hola " }] }],
    };

    const out = await translateJsonContent(doc, "en");
    expect(out.content?.[0].content?.[0].text).toBe("[Hola] ");
  });

  it("no traduce el contenido de un bloque de código", async () => {
    const doc = {
      type: "doc",
      content: [
        { type: "codeBlock", content: [{ type: "text", text: "const hola = 1;" }] },
        { type: "paragraph", content: [{ type: "text", text: "Fin" }] },
      ],
    };

    const out = await translateJsonContent(doc, "en");
    expect(out.content?.[0].content?.[0].text).toBe("const hola = 1;");
    expect(out.content?.[1].content?.[0].text).toBe("[Fin]");
  });

  it("no llama al servicio si no hay nada que traducir", async () => {
    const out = await translateJsonContent({ type: "doc", content: [] }, "en");
    expect(out).toEqual({ type: "doc", content: [] });
    expect(calls).toHaveLength(0);
  });

  it("no muta el documento de partida", async () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }],
    };

    await translateJsonContent(doc, "en");
    expect(doc.content[0].content[0].text).toBe("Original");
  });
});

describe("translateText", () => {
  it("devuelve la cadena vacía sin llamar al servicio", async () => {
    expect(await translateText("   ", "en")).toBe("   ");
    expect(calls).toHaveLength(0);
  });
});
