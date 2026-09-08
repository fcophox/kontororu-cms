import { describe, it, expect } from "vitest";
import { asLocaleVersions, orderVersions } from "@/lib/content/locales";

/**
 * Tests de los badges de idioma del listado.
 *
 * Son dos funciones cortas que deciden algo que el editor lee de un vistazo:
 * en qué idioma está escrito un contenido y cuáles de sus traducciones están
 * vivas en la web. Si el orden o el estado se tuercen, no salta ningún error
 * —sólo se toma una decisión editorial sobre información falsa.
 */

describe("asLocaleVersions", () => {
  it("acepta las filas bien formadas del inventario", () => {
    expect(
      asLocaleVersions([
        { id: "a", locale: "es", status: "PUBLISHED" },
        { id: "b", locale: "en", status: "DRAFT" },
      ]),
    ).toEqual([
      { id: "a", locale: "es", status: "PUBLISHED" },
      { id: "b", locale: "en", status: "DRAFT" },
    ]);
  });

  it("descarta las filas incompletas en vez de romper el listado", () => {
    const versions = asLocaleVersions([
      { id: "a", locale: "es", status: "PUBLISHED" },
      { locale: "en", status: "DRAFT" }, // sin id
      { id: "c", status: "DRAFT" }, // sin idioma
      { id: "d", locale: "fr", status: "PENDIENTE" }, // estado inventado
      null,
    ]);

    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe("a");
  });

  it("un contenido sin traducciones agregadas no es un error", () => {
    // La papelera no trae la columna, y `jsonb_agg` devuelve null sin filas.
    expect(asLocaleVersions(null)).toEqual([]);
    expect(asLocaleVersions(undefined)).toEqual([]);
    expect(asLocaleVersions("[]")).toEqual([]);
  });
});

describe("orderVersions", () => {
  const versions = [
    { id: "b", locale: "en", status: "DRAFT" as const },
    { id: "a", locale: "es", status: "PUBLISHED" as const },
    { id: "c", locale: "fr", status: "PUBLISHED" as const },
  ];

  it("pone el idioma original delante", () => {
    expect(orderVersions(versions, "es").map((v) => v.locale)).toEqual(["es", "en", "fr"]);
  });

  it("conserva el orden del resto", () => {
    expect(orderVersions(versions, "fr").map((v) => v.locale)).toEqual(["fr", "en", "es"]);
  });

  it("no pierde ninguna versión si el original ya no está en la lista", () => {
    // Pasa al borrar la versión española y dejar sólo traducciones.
    expect(orderVersions(versions, "pt").map((v) => v.locale)).toEqual(["en", "es", "fr"]);
  });
});
