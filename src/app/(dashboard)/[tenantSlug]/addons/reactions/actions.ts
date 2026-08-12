"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";

/**
 * Pone a cero los contadores de un contenido.
 *
 * Existe por una razón concreta: probar la integración. Quien conecta el botón
 * en su web pulsa quince veces para comprobar que suma, y sin esto la única
 * forma de limpiar esos quince es entrar en la base. Borra la fila entera en
 * lugar de poner `total = 0` porque un contador a cero y un gesto que nadie ha
 * pulsado nunca son lo mismo, y una fila menos es una fila menos que explicar
 * en la pantalla.
 *
 * No se comprueba sólo en la interfaz: RLS ya limita el borrado a OWNER/ADMIN,
 * pero un error aquí devuelve un mensaje entendible en vez de cero filas
 * afectadas y una pantalla que parece haber funcionado.
 */
export async function resetReactions(tenantSlug: string, translationGroupId: string) {
  const ctx = await getTenantContext(tenantSlug);
  if (!ctx.user.isSuperadmin && !can(ctx.role, "addons.manage")) {
    throw new Error("No tienes permiso para gestionar las reacciones.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("content_reactions")
    .delete()
    .eq("tenant_id", ctx.tenant.id)
    .eq("translation_group_id", translationGroupId);

  if (error) {
    console.error("resetReactions", error);
    throw new Error("No se pudieron poner a cero las reacciones.");
  }

  revalidatePath(`/${tenantSlug}/addons/reactions`);
  revalidatePath(`/${tenantSlug}/content`);
}
