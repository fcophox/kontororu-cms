/**
 * Complemento Calendario — forma y reglas de la disponibilidad.
 *
 * Módulo PURO: lo comparten el formulario (cliente), la acción que guarda
 * (servidor) y el endpoint público. Un solo sitio decide qué es un tramo
 * válido, así que el panel no puede enseñar una rejilla que la API no sepa
 * reproducir.
 */

import { z } from "zod";

/** 0 = domingo, 6 = sábado. El mismo índice que `Date#getDay()`. */
export const WEEKDAYS = [
  { index: 1, label: "Lunes", short: "LUN" },
  { index: 2, label: "Martes", short: "MAR" },
  { index: 3, label: "Miércoles", short: "MIÉ" },
  { index: 4, label: "Jueves", short: "JUE" },
  { index: 5, label: "Viernes", short: "VIE" },
  { index: 6, label: "Sábado", short: "SÁB" },
  { index: 0, label: "Domingo", short: "DOM" },
] as const;

export const SLOT_MINUTES_OPTIONS = [15, 20, 30, 45, 60, 90, 120] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const Time = z.string().regex(TIME_RE, "La hora debe tener el formato HH:MM");

/**
 * La zona horaria se valida contra la base de datos de zonas del propio
 * runtime en vez de contra una lista escrita a mano: una lista se queda
 * obsoleta cada vez que un país cambia de horario de verano.
 */
const Timezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("es", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Zona horaria no reconocida" },
);

export const CalendarSettingsSchema = z
  .object({
    timezone: Timezone.default("America/Santiago"),
    /** Inicio de la jornada, hora local del tenant. */
    startTime: Time.default("09:00"),
    endTime: Time.default("18:00"),
    slotMinutes: z
      .number()
      .int()
      .refine((n) => (SLOT_MINUTES_OPTIONS as readonly number[]).includes(n), {
        message: "Duración de bloque no admitida",
      })
      .default(30),
    /** Días de la semana cerrados por completo. */
    blockedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
    /**
     * Tramos bloqueados por día: `{ "1": ["09:00", "09:30"] }`.
     *
     * Se guarda la HORA DE INICIO, no la etiqueta "09:00 - 09:30 hrs". Con la
     * etiqueta, cambiar la duración del bloque invalidaba en silencio todo lo
     * bloqueado; con la hora de inicio, sólo se pierden los tramos que dejan
     * de existir en la nueva rejilla.
     */
    blockedSlots: z.record(z.string(), z.array(Time)).default({}),
  })
  .refine((s) => toMinutes(s.endTime) > toMinutes(s.startTime), {
    message: "La hora de cierre debe ser posterior a la de apertura",
    path: ["endTime"],
  })
  .refine((s) => toMinutes(s.endTime) - toMinutes(s.startTime) >= s.slotMinutes, {
    message: "La jornada no da ni para un bloque completo",
    path: ["slotMinutes"],
  });

export type CalendarSettings = z.infer<typeof CalendarSettingsSchema>;

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings =
  CalendarSettingsSchema.parse({});

/**
 * Lee la configuración guardada tolerando lo que haya en el JSONB.
 *
 * Un complemento recién activado tiene `{}`, y una configuración escrita por
 * una versión anterior puede no traer todos los campos. En ambos casos vale
 * más una rejilla por defecto que una pantalla rota.
 */
export function parseCalendarSettings(raw: unknown): CalendarSettings {
  const parsed = CalendarSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_CALENDAR_SETTINGS;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type Slot = { start: string; end: string };

/**
 * Rejilla de tramos de un día. El último bloque sólo entra si cabe entero:
 * ofrecer una sesión de 30 minutos que dura 12 es peor que no ofrecerla.
 */
export function buildSlots(settings: CalendarSettings): Slot[] {
  const start = toMinutes(settings.startTime);
  const end = toMinutes(settings.endTime);
  const slots: Slot[] = [];

  for (let t = start; t + settings.slotMinutes <= end; t += settings.slotMinutes) {
    slots.push({ start: fromMinutes(t), end: fromMinutes(t + settings.slotMinutes) });
  }

  return slots;
}

export function isWeekdayBlocked(settings: CalendarSettings, weekday: number): boolean {
  return settings.blockedWeekdays.includes(weekday);
}

export function blockedSlotsFor(settings: CalendarSettings, weekday: number): string[] {
  return settings.blockedSlots[String(weekday)] ?? [];
}

/** Tramos realmente ofrecidos un día concreto — lo que consume la web. */
export function availableSlotsFor(settings: CalendarSettings, weekday: number): Slot[] {
  if (isWeekdayBlocked(settings, weekday)) return [];
  const blocked = new Set(blockedSlotsFor(settings, weekday));
  return buildSlots(settings).filter((slot) => !blocked.has(slot.start));
}
