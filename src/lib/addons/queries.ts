import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { type AddonKey } from "./catalog";

export type TenantAddonRow = {
  addonKey: string;
  isEnabled: boolean;
  settings: unknown;
  enabledAt: string | null;
};

/**
 * Estado de los complementos de un espacio.
 *
 * Devuelve un mapa y no una lista porque quien lo llama siempre pregunta por
 * una clave concreta del catálogo. Las filas cuya clave ya no está en el
 * catálogo se quedan en el mapa a propósito: son complementos retirados y su
 * configuración debe sobrevivir por si vuelven.
 */
export async function getTenantAddons(
  tenantId: string,
): Promise<Record<string, TenantAddonRow>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("tenant_addons")
    .select("addon_key, is_enabled, settings, enabled_at")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("getTenantAddons", error);
    return {};
  }

  const map: Record<string, TenantAddonRow> = {};
  for (const row of data ?? []) {
    map[row.addon_key] = {
      addonKey: row.addon_key,
      isEnabled: row.is_enabled,
      settings: row.settings,
      enabledAt: row.enabled_at,
    };
  }
  return map;
}

/**
 * Fila de un complemento concreto, o `null` si nunca se tocó.
 *
 * `null` y "desactivado" son lo mismo de cara a la UI, pero no de cara al
 * guardado: sin fila hay que insertar, con fila hay que actualizar. Por eso
 * se devuelve la fila y no un booleano.
 */
export async function getTenantAddon(
  tenantId: string,
  key: AddonKey,
): Promise<TenantAddonRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("tenant_addons")
    .select("addon_key, is_enabled, settings, enabled_at")
    .eq("tenant_id", tenantId)
    .eq("addon_key", key)
    .maybeSingle();

  if (error) {
    console.error("getTenantAddon", error);
    return null;
  }
  if (!data) return null;

  return {
    addonKey: data.addon_key,
    isEnabled: data.is_enabled,
    settings: data.settings,
    enabledAt: data.enabled_at,
  };
}
