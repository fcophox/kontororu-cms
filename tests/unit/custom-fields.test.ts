import { describe, it, expect } from "vitest";
import { alignFields, hasSameFieldKeys, unionFieldKeys } from "@/lib/content/custom-fields";

/**
 * Tests del reparto de campos personalizados entre idiomas.
 *
 * Deciden qué campos ve el editor y qué se escribe en las traducciones al
 * guardar. Si se tuercen, el fallo es silencioso: la web pide `duracion` a la
 * versión inglesa y recibe un hueco, o alguien pierde un valor ya escrito
 * porque se sobrescribió al alinear.
 */

describe("unionFieldKeys", () => {
  it("respeta el orden del contenido que se está editando", () => {
    expect(
      unionFieldKeys({ duracion: "3 meses", cliente: "ACME" }, { demo: "", cliente: "ACME Inc." }),
    ).toEqual(["duracion", "cliente", "demo"]);
  });

  it("ignora lo que no es un objeto de campos", () => {
    expect(unionFieldKeys(null, undefined, "texto", { a: "1" })).toEqual(["a"]);
  });
});

describe("alignFields", () => {
  it("conserva lo escrito y deja vacías las claves nuevas", () => {
    expect(alignFields({ cliente: "ACME" }, ["cliente", "duracion"])).toEqual({
      cliente: "ACME",
      duracion: "",
    });
  });

  it("elimina las claves que ya no existen en el contenido", () => {
    // Borrar un campo tiene que borrarlo del contenido entero: si sobrevive en
    // una traducción, la API lo sigue sirviendo en ese idioma.
    expect(alignFields({ cliente: "ACME", viejo: "sobra" }, ["cliente"])).toEqual({
      cliente: "ACME",
    });
  });
});

describe("hasSameFieldKeys", () => {
  it("no ve cambio cuando sólo difiere el orden", () => {
    // Escribir aquí generaría una revisión por una sincronización que no
    // cambia nada de lo que el lector recibe.
    expect(hasSameFieldKeys({ b: "2", a: "1" }, ["a", "b"])).toBe(true);
  });

  it("ve cambio cuando falta o sobra una clave", () => {
    expect(hasSameFieldKeys({ a: "1" }, ["a", "b"])).toBe(false);
    expect(hasSameFieldKeys({ a: "1", b: "2" }, ["a"])).toBe(false);
  });
});
