"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Clock, Info, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEEKDAYS,
  SLOT_MINUTES_OPTIONS,
  buildSlots,
  type CalendarSettings,
} from "@/lib/addons/calendar";
import type { CalendarState } from "./actions";

/**
 * Zonas horarias del propio runtime. Si el navegador no expone
 * `supportedValuesOf` se cae a la que ya está guardada más la del sistema:
 * peor lista, pero nunca un desplegable vacío que impide guardar.
 */
function timezoneOptions(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [current, Intl.DateTimeFormat().resolvedOptions().timeZone];
  return Array.from(new Set([current, ...supported]));
}

export function CalendarForm({
  initial,
  saveAction,
}: {
  initial: CalendarSettings;
  saveAction: (prev: CalendarState, formData: FormData) => Promise<CalendarState>;
}) {
  const [state, formAction, isSaving] = useActionState<CalendarState, FormData>(saveAction, {});
  const [settings, setSettings] = useState<CalendarSettings>(initial);
  const [activeDay, setActiveDay] = useState<number>(WEEKDAYS[0].index);

  const slots = useMemo(() => buildSlots(settings), [settings]);
  const zones = useMemo(() => timezoneOptions(settings.timezone), [settings.timezone]);

  const isDayBlocked = settings.blockedWeekdays.includes(activeDay);
  const blockedSlots = settings.blockedSlots[String(activeDay)] ?? [];

  const patch = (next: Partial<CalendarSettings>) =>
    setSettings((prev) => ({ ...prev, ...next }));

  const toggleDay = () =>
    patch({
      blockedWeekdays: isDayBlocked
        ? settings.blockedWeekdays.filter((d) => d !== activeDay)
        : [...settings.blockedWeekdays, activeDay],
    });

  const toggleSlot = (start: string) => {
    const next = blockedSlots.includes(start)
      ? blockedSlots.filter((s) => s !== start)
      : [...blockedSlots, start];

    patch({
      blockedSlots: { ...settings.blockedSlots, [String(activeDay)]: next },
    });
  };

  return (
    <form action={formAction} className="space-y-6">
      {/* La configuración viaja como un solo JSON: un único esquema la valida
          en el servidor, sin parsear nombres de campo anidados. */}
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />

      <section className="rounded-[var(--radius)] border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Clock className="size-4" />
          Horario de atención
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Los bloques se generan a partir de este rango. Cambiarlo rehace la
          rejilla de abajo.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="startTime">Apertura</Label>
            <Input
              id="startTime"
              type="time"
              value={settings.startTime}
              onChange={(e) => patch({ startTime: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endTime">Cierre</Label>
            <Input
              id="endTime"
              type="time"
              value={settings.endTime}
              onChange={(e) => patch({ endTime: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slotMinutes">Duración del bloque</Label>
            <select
              id="slotMinutes"
              value={settings.slotMinutes}
              onChange={(e) => patch({ slotMinutes: Number(e.target.value) })}
              className="h-9 w-full rounded-[var(--radius)] border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {SLOT_MINUTES_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} minutos
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Zona horaria</Label>
            <select
              id="timezone"
              value={settings.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              className="h-9 w-full rounded-[var(--radius)] border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {zones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border bg-card">
        <div className="flex flex-wrap items-center gap-1 border-b p-2">
          {WEEKDAYS.map((day) => {
            const isActive = activeDay === day.index;
            const hasBlocks =
              settings.blockedWeekdays.includes(day.index) ||
              (settings.blockedSlots[String(day.index)]?.length ?? 0) > 0;

            return (
              <button
                key={day.index}
                type="button"
                onClick={() => setActiveDay(day.index)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {day.label}
                {hasBlocks && (
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${
                      isActive ? "bg-primary-foreground" : "bg-destructive"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[var(--radius)] border">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <h2 className="font-medium">
                {WEEKDAYS.find((d) => d.index === activeDay)?.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isDayBlocked
                  ? "Día cerrado: no se ofrece ningún bloque."
                  : `${slots.length - blockedSlots.length} de ${slots.length} bloques disponibles`}
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDayBlocked}
              onChange={toggleDay}
              className="size-4 accent-[var(--destructive)]"
            />
            Cerrar el día completo
          </label>
        </div>

        <div className="p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Pulsa un bloque para dejar de ofrecerlo. Los bloques marcados no
            estarán disponibles para agendar.
          </p>

          {slots.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed p-6 text-center text-sm text-muted-foreground">
              El rango horario no da para ningún bloque completo. Amplía el
              horario o acorta la duración.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {slots.map((slot) => {
                const isBlocked = blockedSlots.includes(slot.start);

                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => toggleSlot(slot.start)}
                    disabled={isDayBlocked}
                    aria-pressed={isBlocked}
                    className={`rounded-[var(--radius)] border px-3 py-3 text-sm transition-colors disabled:opacity-40 ${
                      isBlocked
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {slot.start} – {slot.end}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-[var(--radius)] border bg-card p-5">
        <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Esta disponibilidad se sirve por la API en{" "}
          <code className="font-mono text-xs">
            GET /api/v1/addons/calendar/availability
          </code>
          , para que el formulario de agenda de tu web sólo ofrezca lo que aquí
          queda abierto. Al cambiar el rango o la duración, los bloques
          bloqueados que dejen de existir se descartan al guardar.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          Guardar disponibilidad
        </Button>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-muted-foreground">{state.ok}</p>}
      </div>
    </form>
  );
}
