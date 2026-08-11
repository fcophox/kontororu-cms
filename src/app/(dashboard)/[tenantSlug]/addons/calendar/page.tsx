import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { getTenantAddon } from "@/lib/addons/queries";
import { parseCalendarSettings } from "@/lib/addons/calendar";
import { CalendarForm } from "./calendar-form";
import { saveCalendarSettings, type CalendarState } from "./actions";

export const metadata = { title: "Calendario" };

export default async function CalendarAddonPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requirePermission(tenantSlug, "addons.manage");

  const addon = await getTenantAddon(tenant.id, "calendar");

  // Complemento apagado = pantalla inexistente. Un 404 y no un aviso: la ruta
  // de un complemento que no se ha contratado no debería confirmar que existe.
  if (!addon?.isEnabled) notFound();

  const settings = parseCalendarSettings(addon.settings);

  const save = async (prev: CalendarState, formData: FormData) => {
    "use server";
    return saveCalendarSettings(tenantSlug, prev, formData);
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <Link
        href={`/${tenantSlug}/addons`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Complementos
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define tu horario de atención y bloquea los días o tramos que no
          quieras ofrecer. Lo que quede disponible es lo que verá quien intente
          agendar contigo.
        </p>
      </header>

      <CalendarForm initial={settings} saveAction={save} />
    </div>
  );
}
