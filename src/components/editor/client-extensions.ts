"use client";

import { editorExtensions } from "./extensions";
import { KntrImageWithControls } from "./image-node";

/**
 * Las extensiones del editor = las del esquema, con la imagen sustituida por
 * la versión con nodeview.
 *
 * El esquema tiene que ser el mismo que usa el render a HTML en servidor —
 * de ahí que se parta de `editorExtensions` en vez de mantener dos listas
 * que se desincronizan a la primera extensión nueva.
 */
export function buildEditorExtensions(tenantId: string) {
  return editorExtensions.map((extension) =>
    extension.name === "image"
      ? KntrImageWithControls.configure({ tenantId })
      : extension,
  );
}
