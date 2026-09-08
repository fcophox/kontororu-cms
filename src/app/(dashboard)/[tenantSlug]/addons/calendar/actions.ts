"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import { CalendarSettingsSchema, buildSlots } from "@/lib/addons/calendar";
import { dispatchNow } from "@/lib/content/webhook-dispatch";

export type CalendarState = { error?: string; ok?: string };

/**
 * Guarda la disponibilidad del complemento Calendario.
 *
 * El formulario manda la configuración como un único JSON en vez de campo a
 * campo: la rejilla de tramos bloqueados es un objeto anidado y reconstruirlo
 * desde `FormData` con nombres tipo `blocked[1][]` es un parser a mano que
 * puede desincronizarse del esquema. Aquí hay UN esquema y valida el todo.
 */
export async function saveCalendarSettings(
  tenantSlug: string,
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const raw = String(formData.get("settings") ?? "");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "No se pudo leer la configuración enviada." };
  }

  const parsed = CalendarSettingsSchema.safeParse(json);
  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    const first =
      Object.values(issues).flat()[0] ??
      z.flattenError(parsed.error).formErrors[0] ??
      "Configuración no válida";
    return { error: first };
  }

  const settings = parsed.data;

  // Cambiar el rango o la duración puede dejar tramos bloqueados que ya no
  // existen en la rejilla. Se descartan al guardar en vez de arrastrarlos:
  // guardados, reaparecerían como bloqueos fantasma si el horario vuelve.
  const valid = new Set(buildSlots(settings).map((s) => s.start));
  const blockedSlots: Record<string, string[]> = {};
  for (const [weekday, slots] of Object.entries(settings.blockedSlots)) {
    const kept = slots.filter((s) => valid.has(s));
    if (kept.length) blockedSlots[weekday] = kept;
  }

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "addons.manage")) {
    return { error: "No tienes permiso para configurar complementos." };
  }

  const supabase = await createServerClient();

  // `update` y no `upsert`: llegar aquí exige haber activado el complemento,
  // y un upsert crearía la fila configurada pero apagada, que es un estado
  // que la pantalla de complementos no sabe explicar.
  const { data, error } = await supabase
    .from("tenant_addons")
    .update({ settings: { ...settings, blockedSlots } })
    .eq("tenant_id", tenant.id)
    .eq("addon_key", "calendar")
    .eq("is_enabled", true)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("saveCalendarSettings", error);
    return { error: "No se pudo guardar la disponibilidad." };
  }
  if (!data) return { error: "El complemento Calendario no está activo." };

  // El trigger acaba de encolar `addon.updated`; se entrega YA. Esperar al
  // turno del cron —cinco minutos— dejaría la web del cliente ofreciendo
  // horas que aquí se acaban de cerrar, que es justo lo que este evento
  // existe para evitar.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/addons/calendar`);
  return { ok: "Disponibilidad guardada." };
}
