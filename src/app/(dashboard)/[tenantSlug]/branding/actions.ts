"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import type { Json } from "@/lib/supabase/types";

const HEX = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
const RADIUS = /^\d+(\.\d+)?(rem|px)$/;

/*
 * Se guarda el id del archivo, no su URL.
 *
 * El bucket es privado: cualquier URL suya caduca, y la que se guardó una vez
 * deja de servir a los pocos días sin que nadie toque nada. El id es estable y
 * la URL se firma al leer, en `resolveBrandingMedia()`.
 */
const BrandingInput = z.object({
  primary: z.string().regex(HEX, "Color primario no válido"),
  secondary: z.string().regex(HEX, "Color secundario no válido"),
  radius: z.string().regex(RADIUS, "Radio no válido"),
  logoMediaId: z.uuid("Logotipo no válido").nullable(),
  faviconMediaId: z.uuid("Favicon no válido").nullable(),
});

export type BrandingState = { error?: string; ok?: boolean };

/**
 * Guarda el branding del tenant.
 *
 * Se valida aquí Y en `parseBranding` al leer. No es redundancia por exceso:
 * el JSONB puede llegar a tener valores escritos por otra vía (una migración,
 * un script de soporte), y lo que se serializa dentro de un `<style>` no
 * puede depender de que la escritura fuera correcta.
 */
export async function saveBranding(
  tenantSlug: string,
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const parsed = BrandingInput.safeParse({
    primary: formData.get("primary"),
    secondary: formData.get("secondary"),
    radius: formData.get("radius"),
    logoMediaId: formData.get("logoMediaId") || null,
    faviconMediaId: formData.get("faviconMediaId") || null,
  });

  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "branding.manage")) {
    return { error: "No tienes permiso para cambiar la marca." };
  }

  const supabase = await createServerClient();

  // Los ids llegan del navegador: se comprueba que apunten a archivos de ESTE
  // tenant. Sin esto se podría guardar el logo de otro cliente en la marca
  // propia con un id copiado a mano.
  const ids = [parsed.data.logoMediaId, parsed.data.faviconMediaId].filter(
    (id): id is string => id !== null,
  );

  if (ids.length > 0) {
    const { data: owned } = await supabase
      .from("media")
      .select("id")
      .eq("tenant_id", tenant.id)
      .in("id", ids);

    if ((owned?.length ?? 0) !== new Set(ids).size) {
      return { error: "La imagen seleccionada no pertenece a este espacio." };
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({ branding: parsed.data as unknown as Json })
    .eq("id", tenant.id);

  if (error) return { error: "No se pudo guardar la marca." };

  // El branding se inyecta en el layout del tenant, así que hay que
  // revalidar TODO el subárbol, no sólo esta pantalla.
  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true };
}
