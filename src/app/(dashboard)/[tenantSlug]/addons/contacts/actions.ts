"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";

/**
 * Guard común de la bandeja.
 *
 * Las tres acciones tocan datos personales de terceros, así que ninguna se
 * fía del gate de la pantalla: se comprueba el permiso en cada una. RLS es la
 * frontera real, pero un error aquí devuelve un mensaje entendible en vez de
 * cero filas afectadas y una interfaz que parece funcionar.
 */
async function requireContactsAccess(tenantSlug: string) {
  const ctx = await getTenantContext(tenantSlug);
  if (!ctx.user.isSuperadmin && !can(ctx.role, "addons.manage")) {
    throw new Error("No tienes permiso para gestionar los contactos.");
  }
  return ctx;
}

/** Marca como leído al abrir el detalle. */
export async function markSubmissionRead(tenantSlug: string, id: string) {
  const { tenant } = await requireContactsAccess(tenantSlug);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("form_submissions")
    .update({ status: "READ" })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .eq("status", "NEW");

  if (error) {
    console.error("markSubmissionRead", error);
    throw new Error("No se pudo marcar como leído.");
  }

  revalidatePath(`/${tenantSlug}/addons/contacts`);
}

export async function archiveSubmission(
  tenantSlug: string,
  id: string,
  archived: boolean,
) {
  const { tenant } = await requireContactsAccess(tenantSlug);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("form_submissions")
    .update({ is_archived: archived })
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) {
    console.error("archiveSubmission", error);
    throw new Error("No se pudo archivar el contacto.");
  }

  revalidatePath(`/${tenantSlug}/addons/contacts`);
}

/**
 * Borrado definitivo, y sólo desde archivados.
 *
 * El `.eq("is_archived", true)` no es redundante con la interfaz: archivar es
 * el paso que obliga a mirar dos veces antes de perder el correo de alguien
 * que escribió de verdad. Si el botón se colara en la bandeja, la base seguiría
 * negándose.
 */
export async function deleteSubmission(tenantSlug: string, id: string) {
  const { tenant } = await requireContactsAccess(tenantSlug);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("form_submissions")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .eq("is_archived", true);

  if (error) {
    console.error("deleteSubmission", error);
    throw new Error("No se pudo eliminar el contacto.");
  }

  revalidatePath(`/${tenantSlug}/addons/contacts`);
}
