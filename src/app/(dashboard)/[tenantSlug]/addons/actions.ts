"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import { findAddon, isAddonKey } from "@/lib/addons/catalog";
import { dispatchNow } from "@/lib/content/webhook-dispatch";

/**
 * Activa o desactiva un complemento del espacio.
 *
 * Desactivar NO borra `settings`: la configuración del calendario sobrevive a
 * un apagado y vuelve tal cual al reactivarlo. Alguien que apaga un
 * complemento para ver qué pasa no debería perder su horario por curiosidad.
 */
export async function toggleAddon(
  tenantSlug: string,
  addonKey: string,
  enabled: boolean,
) {
  if (!isAddonKey(addonKey)) throw new Error("Complemento desconocido.");

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "addons.manage")) {
    throw new Error("No tienes permiso para gestionar complementos.");
  }

  const supabase = await createServerClient();

  const { error } = await supabase.from("tenant_addons").upsert(
    {
      tenant_id: tenant.id,
      addon_key: addonKey,
      is_enabled: enabled,
      enabled_at: enabled ? new Date().toISOString() : null,
      enabled_by: enabled ? user.id : null,
    },
    // Sin `onConflict` el upsert choca contra la clave primaria, que aquí no
    // es la que identifica el complemento: lo hace (tenant_id, addon_key).
    { onConflict: "tenant_id,addon_key" },
  );

  if (error) {
    console.error("toggleAddon", error);
    throw new Error("No se pudo cambiar el estado del complemento.");
  }

  // El registro se escribe con service_role. Las migraciones sólo conceden
  // SELECT sobre `audit_logs` a `authenticated`, así que un insert con la
  // sesión del usuario se pierde en silencio —el error ni siquiera se mira—.
  // Que en algún entorno los privilegios por defecto lo permitan no lo
  // arregla: un log de auditoría que depende del entorno para escribirse es
  // peor que no tenerlo, porque parece que está.
  await createServiceClient().from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: enabled ? "addon.enable" : "addon.disable",
    entity: "tenant_addon",
    metadata: { addon: addonKey, name: findAddon(addonKey)?.name ?? addonKey },
  });

  // Apagar un complemento deja su endpoint devolviendo 404: la web del
  // cliente necesita enterarse a la vez que el panel, no cinco minutos
  // después con la sección ya rota.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/addons`);
  revalidatePath(`/${tenantSlug}`, "layout");
}
