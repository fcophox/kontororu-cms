"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import {
  PortfolioItemSchema,
  PortfolioSettingsSchema,
  parsePortfolioSettings,
  type PortfolioSettings,
} from "@/lib/addons/portfolio";
import { dispatchNow } from "@/lib/content/webhook-dispatch";

export type PortfolioState = { error?: string; ok?: string };

/** Lo que manda el drawer de configuración: nunca los elementos. */
const ConfigSchema = PortfolioSettingsSchema.pick({ gallery: true, isPublished: true });

/** Lo que manda el formulario; el id y la fecha las pone el servidor. */
const ItemFieldsSchema = PortfolioItemSchema.omit({ id: true, createdAt: true });

/** Lee los campos del elemento de un `FormData` y traduce el fallo a una frase. */
function readItemFields(formData: FormData) {
  const parsed = ItemFieldsSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    imageMediaId: formData.get("imageMediaId") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    category: formData.get("category") ?? "",
  });

  if (parsed.success) return { fields: parsed.data } as const;

  const flat = z.flattenError(parsed.error);
  const first =
    Object.values(flat.fieldErrors).flat()[0] ??
    flat.formErrors[0] ??
    "Revisa los datos del elemento.";
  return { error: first } as const;
}

/**
 * Contexto común de las dos acciones: permiso, fila del complemento y su
 * configuración ya parseada.
 *
 * Las dos escriben el objeto `settings` COMPLETO —JSONB no sabe actualizar
 * una clave suelta—, así que las dos necesitan leer antes de escribir. Sin
 * esto, guardar la galería devolvería `items` a su valor por defecto y el
 * portfolio se vaciaría al cambiar de plantilla.
 */
async function loadWritableSettings(tenantSlug: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "addons.manage")) {
    return { error: "No tienes permiso para configurar complementos." } as const;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("tenant_addons")
    .select("settings")
    .eq("tenant_id", tenant.id)
    .eq("addon_key", "portfolio")
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) {
    console.error("loadWritableSettings(portfolio)", error);
    return { error: "No se pudo leer la configuración del portfolio." } as const;
  }
  if (!data) return { error: "El complemento Portfolio no está activo." } as const;

  return { tenant, supabase, settings: parsePortfolioSettings(data.settings) } as const;
}

/** Escribe el objeto completo y avisa a la web del cliente. */
async function writeSettings(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  tenantId: string,
  tenantSlug: string,
  settings: PortfolioSettings,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenant_addons")
    .update({ settings })
    .eq("tenant_id", tenantId)
    .eq("addon_key", "portfolio")
    .eq("is_enabled", true)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("writeSettings(portfolio)", error);
    return "No se pudo guardar la configuración.";
  }
  if (!data) return "El complemento Portfolio no está activo.";

  // El trigger acaba de encolar `addon.updated`: la web del cliente se entera
  // al guardar, no en el turno del cron cinco minutos después.
  after(() => dispatchNow(tenantId));

  revalidatePath(`/${tenantSlug}/addons/portfolio`);
  return null;
}

/**
 * Guarda la galería elegida en el drawer de configuración.
 *
 * Mismo trato que el Calendario: el formulario manda un único JSON y lo
 * valida el esquema compartido, para que añadir un ajuste no obligue a tocar
 * también un parser de `FormData`.
 */
export async function savePortfolioSettings(
  tenantSlug: string,
  _prev: PortfolioState,
  formData: FormData,
): Promise<PortfolioState> {
  const raw = String(formData.get("settings") ?? "");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "No se pudo leer la configuración enviada." };
  }

  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) return { error: "Esa galería no está disponible." };

  const ctx = await loadWritableSettings(tenantSlug);
  if ("error" in ctx) return { error: ctx.error };

  const failure = await writeSettings(ctx.supabase, ctx.tenant.id, tenantSlug, {
    ...ctx.settings,
    gallery: parsed.data.gallery,
    isPublished: parsed.data.isPublished,
  });

  return failure ? { error: failure } : { ok: "Configuración guardada." };
}

/**
 * Añade un trabajo al portfolio.
 *
 * La imagen ya está subida cuando llega aquí: el drawer la manda a
 * `/api/media/upload` al elegirla, que es quien valida MIME, tamaño y cuota.
 * Este formulario sólo guarda la referencia.
 */
export async function createPortfolioItem(
  tenantSlug: string,
  _prev: PortfolioState,
  formData: FormData,
): Promise<PortfolioState> {
  const read = readItemFields(formData);
  if ("error" in read) return { error: read.error };

  const ctx = await loadWritableSettings(tenantSlug);
  if ("error" in ctx) return { error: ctx.error };

  // Al principio de la lista: lo último creado es lo que se quiere ver y
  // colocar, y buscarlo al final de un portfolio largo es trabajo de más.
  const items = [
    { ...read.fields, id: randomUUID(), createdAt: new Date().toISOString() },
    ...ctx.settings.items,
  ];

  const failure = await writeSettings(ctx.supabase, ctx.tenant.id, tenantSlug, {
    ...ctx.settings,
    items,
  });

  return failure ? { error: failure } : { ok: "Elemento creado." };
}

/**
 * Edita un trabajo ya existente.
 *
 * El elemento se sustituye en su sitio, sin reordenar: quien corrige una
 * errata no espera que el trabajo salte al principio del portfolio. `id` y
 * `createdAt` se conservan del original y no se leen del formulario.
 */
export async function updatePortfolioItem(
  tenantSlug: string,
  _prev: PortfolioState,
  formData: FormData,
): Promise<PortfolioState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el elemento a editar." };

  const read = readItemFields(formData);
  if ("error" in read) return { error: read.error };

  const ctx = await loadWritableSettings(tenantSlug);
  if ("error" in ctx) return { error: ctx.error };

  const current = ctx.settings.items.find((item) => item.id === id);
  if (!current) return { error: "Ese elemento ya no existe." };

  const items = ctx.settings.items.map((item) =>
    item.id === id ? { ...read.fields, id: current.id, createdAt: current.createdAt } : item,
  );

  const failure = await writeSettings(ctx.supabase, ctx.tenant.id, tenantSlug, {
    ...ctx.settings,
    items,
  });

  return failure ? { error: failure } : { ok: "Elemento actualizado." };
}

/**
 * Quita un trabajo del portfolio.
 *
 * La imagen NO se borra de la mediateca: puede estar usada en una entrada, y
 * un borrado en cascada desde aquí dejaría huecos en contenidos que nadie ha
 * tocado. Se limpia desde Medios, que es donde se ve qué usa cada archivo.
 */
export async function deletePortfolioItem(
  tenantSlug: string,
  id: string,
): Promise<PortfolioState> {
  const ctx = await loadWritableSettings(tenantSlug);
  if ("error" in ctx) return { error: ctx.error };

  const items = ctx.settings.items.filter((item) => item.id !== id);
  // Nada que borrar: se responde en verde igualmente. Un doble clic no es un
  // error, y el resultado que pedía —que no esté— ya se cumple.
  if (items.length === ctx.settings.items.length) return { ok: "Elemento eliminado." };

  const failure = await writeSettings(ctx.supabase, ctx.tenant.id, tenantSlug, {
    ...ctx.settings,
    items,
  });

  return failure ? { error: failure } : { ok: "Elemento eliminado." };
}
