import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import {
  apiError,
  apiJson,
  corsPreflight,
  volatileCacheHeaders,
} from "@/lib/api/response";
import {
  parseCalendarSettings,
  buildSlots,
  availableSlotsFor,
  WEEKDAYS,
} from "@/lib/addons/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/addons/calendar/availability
 *
 * La disponibilidad semanal del cliente, para que el formulario de agenda de
 * su web sólo ofrezca tramos que existen.
 *
 * Se sirve la SEMANA, no fechas concretas: la configuración es un patrón
 * semanal y devolver un calendario expandido obligaría a inventar un horizonte
 * ("¿90 días? ¿un año?") y a decidir festivos que aquí no se declaran. Quien
 * consume ya sabe qué día de la semana cae cada fecha.
 *
 * Requiere el scope `content:read`: es configuración pública del cliente, del
 * mismo nivel de sensibilidad que sus categorías.
 */
export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  const guard = await guardApiRequest(req, "content:read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const db = createServiceClient();

  const { data, error } = await db
    .from("tenant_addons")
    .select("settings, is_enabled")
    .eq("tenant_id", ctx.tenantId)
    .eq("addon_key", "calendar")
    .maybeSingle();

  if (error) {
    console.error("GET /api/v1/addons/calendar/availability", error);
    return apiError("server_error", "No se pudo recuperar la disponibilidad.");
  }

  // Complemento no contratado y complemento apagado son el mismo 404: la API
  // no es el sitio donde enterarse de qué se podría contratar.
  if (!data?.is_enabled) {
    return apiError("not_found", "El complemento Calendario no está activo.");
  }

  const settings = parseCalendarSettings(data.settings);

  return apiJson(
    {
      data: {
        timezone: settings.timezone,
        startTime: settings.startTime,
        endTime: settings.endTime,
        slotMinutes: settings.slotMinutes,
        /** Rejilla completa del día, antes de aplicar bloqueos. */
        slots: buildSlots(settings),
        week: WEEKDAYS.map((day) => ({
          weekday: day.index,
          label: day.label,
          isClosed: settings.blockedWeekdays.includes(day.index),
          available: availableSlotsFor(settings, day.index),
        })),
      },
    },
    // La disponibilidad no la avisa ningún webhook: se sirve con una ventana
    // corta para que un cambio del panel llegue solo a la web del cliente.
    { ...guard.headers, ...volatileCacheHeaders() },
  );
}
