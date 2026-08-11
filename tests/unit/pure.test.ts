import { describe, it, expect } from "vitest";
import { slugify, slugifyLive, uniqueSlug, readingTime } from "@/lib/content/slug";
import { parseBranding, brandingToCssVars } from "@/lib/theme/branding";
import { readableForeground, contrastRatio, hexToRgb } from "@/lib/theme/color";
import { readImageSize } from "@/lib/storage/image-size";
import { asLimits, asContentStatus, asJsonContent } from "@/lib/content/json";

/**
 * Tests de las funciones puras.
 *
 * Son las que no cubre ni pgTAP (viven fuera de la base) ni la suite de
 * integración (no cruzan la red). También son las que se rompen en silencio:
 * un slug mal generado o un parser de cabecera con un offset corrido no lanza
 * ningún error, sólo produce datos malos.
 */

describe("slugify", () => {
  it("quita acentos y eñes en lugar de descartar el carácter", () => {
    expect(slugify("Diseño de Interfaces")).toBe("diseno-de-interfaces");
    expect(slugify("Cómo migrar de WordPress")).toBe("como-migrar-de-wordpress");
  });

  it("colapsa separadores y no deja guion final", () => {
    expect(slugify("  Hola   ---  mundo  ")).toBe("hola-mundo");
    expect(slugify("Título con puntuación!!!")).toBe("titulo-con-puntuacion");
  });

  it("no supera los 80 caracteres", () => {
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });

  it("devuelve cadena vacía si no queda nada utilizable", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("日本語")).toBe("");
  });
});

describe("slugifyLive", () => {
  it("formatea un titular pegado tal cual", () => {
    expect(slugifyLive("Los agentes de IA ya no piden permiso")).toBe(
      "los-agentes-de-ia-ya-no-piden-permiso",
    );
    expect(slugifyLive("¿Cómo migrar de WordPress?")).toBe("como-migrar-de-wordpress");
  });

  it("conserva el guion final para poder seguir escribiendo", () => {
    // Es la diferencia con slugify: sin esto, al pulsar el espacio se perdería
    // el separador y la siguiente letra se pegaría — "holamundo".
    expect(slugifyLive("hola ")).toBe("hola-");
    expect(slugifyLive("hola-" + "mundo")).toBe("hola-mundo");
  });

  it("no deja que el slug empiece por guion", () => {
    expect(slugifyLive("  hola")).toBe("hola");
    expect(slugifyLive("---hola")).toBe("hola");
  });

  it("colapsa separadores repetidos mientras se teclea", () => {
    expect(slugifyLive("hola   mundo")).toBe("hola-mundo");
    expect(slugifyLive("hola -- mundo")).toBe("hola-mundo");
  });

  it("coincide con slugify una vez el texto está completo", () => {
    for (const input of ["Diseño de Interfaces", "Título con puntuación!!!", "a b c"]) {
      expect(slugifyLive(input)).toBe(slugify(input));
    }
  });

  it("respeta el límite de 80 caracteres", () => {
    expect(slugifyLive("a".repeat(200))).toHaveLength(80);
  });
});

describe("uniqueSlug", () => {
  it("respeta el slug si está libre", () => {
    expect(uniqueSlug("Mi Post", [])).toBe("mi-post");
  });

  it("añade sufijo incremental ante colisiones", () => {
    expect(uniqueSlug("Mi Post", ["mi-post"])).toBe("mi-post-2");
    expect(uniqueSlug("Mi Post", ["mi-post", "mi-post-2", "mi-post-3"])).toBe("mi-post-4");
  });

  it("cae a un slug utilizable cuando el título no produce ninguno", () => {
    expect(uniqueSlug("¿?", [])).toBe("sin-titulo");
  });
});

describe("readingTime", () => {
  it("nunca baja de un minuto", () => {
    expect(readingTime("dos palabras")).toBe(1);
    expect(readingTime("")).toBe(1);
  });

  it("calcula a 200 palabras por minuto", () => {
    expect(readingTime("palabra ".repeat(600))).toBe(3);
  });
});

describe("parseBranding", () => {
  it("acepta hex de 3 y 6 dígitos y los normaliza", () => {
    expect(parseBranding({ primary: "#ABC" }).primary).toBe("#aabbcc");
    expect(parseBranding({ primary: "E11D48" }).primary).toBe("#e11d48");
  });

  it("descarta valores que serían inyección CSS", () => {
    // El caso que motiva el validador: el JSONB es entrada de usuario y se
    // serializa dentro de un <style>.
    const b = parseBranding({ primary: "red;} body{display:none}", radius: "1rem; evil" });
    expect(b.primary).toBe("#111827");
    expect(b.radius).toBe("0.625rem");
  });

  it("sólo admite URLs http(s) o rutas del propio origen en el logo", () => {
    expect(parseBranding({ logoUrl: "javascript:alert(1)" }).logoUrl).toBeNull();
    expect(parseBranding({ logoUrl: "//evil.com/x.png" }).logoUrl).toBeNull();
    expect(parseBranding({ logoUrl: "https://cdn.example.com/l.png" }).logoUrl).toBe(
      "https://cdn.example.com/l.png",
    );
    expect(parseBranding({ logoUrl: "/storage/logo.png" }).logoUrl).toBe("/storage/logo.png");
  });

  it("tolera un branding nulo o corrupto", () => {
    expect(parseBranding(null).primary).toBe("#111827");
    expect(parseBranding("no soy un objeto").radius).toBe("0.625rem");
  });
});

describe("contraste del theming", () => {
  it("elige el texto legible sobre cualquier marca", () => {
    expect(readableForeground(hexToRgb("#111827"))).toBe("#ffffff");
    // El caso que rompe un foreground fijo: amarillo flúor.
    expect(readableForeground(hexToRgb("#f5ff00"))).toBe("#0a0a0a");
  });

  it("el par primary/primary-foreground supera el mínimo AA de 4.5:1", () => {
    for (const brand of ["#111827", "#e11d48", "#f5ff00", "#6366f1", "#ffffff"]) {
      const vars = brandingToCssVars(parseBranding({ primary: brand, secondary: brand }));
      const ratio = contrastRatio(
        hexToRgb(vars["--primary"]),
        hexToRgb(vars["--primary-foreground"]),
      );
      expect(ratio, `contraste insuficiente para ${brand}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("readImageSize", () => {
  it("lee la cabecera IHDR de un PNG", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 1920);
    new DataView(png.buffer).setUint32(20, 1080);
    expect(readImageSize(png, "image/png")).toEqual({ width: 1920, height: 1080 });
  });

  it("lee la cabecera de un GIF (little-endian)", () => {
    const gif = new Uint8Array(10);
    gif.set([0x47, 0x49, 0x46], 0);
    new DataView(gif.buffer).setUint16(6, 800, true);
    new DataView(gif.buffer).setUint16(8, 600, true);
    expect(readImageSize(gif, "image/gif")).toEqual({ width: 800, height: 600 });
  });

  it("devuelve null en formatos sin parser en vez de lanzar", () => {
    expect(readImageSize(new Uint8Array(64), "image/avif")).toBeNull();
    expect(readImageSize(new Uint8Array(64), "application/pdf")).toBeNull();
  });

  it("devuelve null ante bytes truncados o corruptos", () => {
    expect(readImageSize(new Uint8Array([0x89, 0x50]), "image/png")).toBeNull();
    expect(readImageSize(new Uint8Array(0), "image/jpeg")).toBeNull();
  });
});

describe("narrowing de JSONB", () => {
  it("asLimits rellena con los valores por defecto lo que falte", () => {
    expect(asLimits({ maxPosts: 500 })).toEqual({
      maxUsers: 3,
      maxPosts: 500,
      maxStorageMb: 1024,
      maxApiKeys: 2,
    });
    expect(asLimits(null).maxUsers).toBe(3);
    expect(asLimits({ maxUsers: "muchos" }).maxUsers).toBe(3);
  });

  it("asContentStatus rechaza lo que no sea del enum", () => {
    expect(asContentStatus("PUBLISHED")).toBe("PUBLISHED");
    expect(asContentStatus("published")).toBeNull();
    expect(asContentStatus("'; drop table posts; --")).toBeNull();
  });

  it("asJsonContent devuelve un documento vacío ante datos inservibles", () => {
    expect(asJsonContent(null)).toEqual({ type: "doc", content: [] });
    expect(asJsonContent("texto suelto")).toEqual({ type: "doc", content: [] });
    expect(asJsonContent({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
