/**
 * Complemento Contactos — piezas compartidas entre la bandeja y la API.
 *
 * Módulo PURO: lo importan el componente cliente de la lista y el route
 * handler que recibe los envíos.
 */

import { z } from "zod";

export const SUBMISSIONS_PER_PAGE = 50;

/** `form_key` admitido: minúsculas, sin espacios. Igual que el CHECK de la base. */
export const FORM_KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

/**
 * Etiqueta legible de un formulario.
 *
 * Se deriva de la clave en vez de mantener un diccionario: el cliente inventa
 * sus propios formularios y un mapa en código se quedaría corto el primer día.
 * "presupuesto-web" se lee "PRESUPUESTO WEB", que es suficiente para una
 * pestaña y no miente sobre lo que llegó.
 */
export function formLabel(key: string): string {
  return key.replace(/[-_]+/g, " ").toUpperCase();
}

/**
 * Envío entrante.
 *
 * `name`, `email` y `message` son opcionales porque no todo formulario los
 * pide —una lista de espera puede ser sólo un correo— pero al menos uno de
 * los tres tiene que venir: una fila sin nada que mostrar es ruido en la
 * bandeja, no un contacto.
 */
export const SubmissionInput = z
  .object({
    name: z.string().trim().max(200).optional(),
    email: z.string().trim().email("El correo no es válido").max(320).optional(),
    message: z.string().trim().max(20_000).optional(),
    sourceUrl: z.string().trim().url().max(2048).optional(),
    /**
     * Resto de campos del formulario, tal cual los mandó la web.
     *
     * `z.json()` y no `unknown`: lo que no se puede serializar no cabe en un
     * JSONB, y descubrirlo al insertar da un error de base en vez de un 400
     * que explique qué campo sobra.
     */
    payload: z.record(z.string(), z.json()).default({}),
  })
  .refine((s) => Boolean(s.name || s.email || s.message), {
    message: "El envío necesita al menos nombre, correo o mensaje",
  });

export type SubmissionInput = z.infer<typeof SubmissionInput>;

export type SubmissionRow = {
  id: string;
  formKey: string;
  name: string | null;
  email: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  status: "NEW" | "READ";
  isArchived: boolean;
  sourceUrl: string | null;
  createdAt: string;
};

/**
 * Campos del payload que no aportan nada en el detalle porque ya tienen su
 * propia fila en la ficha. Se ocultan para que "Resto del formulario" no
 * repita el nombre y el correo que están arriba.
 */
export const PROMOTED_PAYLOAD_KEYS = new Set(["name", "email", "message", "sourceUrl"]);
