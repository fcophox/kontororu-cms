"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getTenantContext, type TenantRole } from "@/lib/auth/tenant-context";
import { can, atLeast } from "@/lib/auth/guards";

const InviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Email no válido"),
  role: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR"]),
});

export type TeamState = { error?: string; ok?: string };

/**
 * Invita a un colaborador al tenant.
 *
 * Requiere `service_role` porque hay que crear (o localizar) una cuenta en
 * `auth.users`, algo que la anon key no puede hacer. Todo lo demás —quién
 * invita, a qué tenant, con qué rol— se valida ANTES de tocar el cliente
 * privilegiado: a partir de ahí RLS ya no protege nada.
 */
export async function inviteMember(
  tenantSlug: string,
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const parsed = InviteInput.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors.email?.[0] ?? "Datos no válidos" };
  }
  const { email, role } = parsed.data;

  const { tenant, role: actorRole, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(actorRole, "team.manage")) {
    return { error: "No tienes permiso para invitar colaboradores." };
  }

  // Nadie invita por encima de su propio nivel: un ADMIN no crea un OWNER.
  if (!user.isSuperadmin && !atLeast(actorRole, role as TenantRole)) {
    return { error: "No puedes asignar un rol superior al tuyo." };
  }

  const scoped = await createServerClient();
  const { count } = await scoped
    .from("tenant_users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);

  if ((count ?? 0) >= tenant.limits.maxUsers) {
    return {
      error: `Tu plan permite ${tenant.limits.maxUsers} colaboradores. Contacta con Rukma Studio para ampliarlo.`,
    };
  }

  const admin = createServiceClient();

  // ¿Ya existe la cuenta? Un colaborador puede trabajar para varios clientes;
  // reutilizamos su usuario en lugar de duplicarlo.
  const { data: existingProfile } = await admin
    .from("users_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let userId = existingProfile?.id ?? null;
  let invited = false;

  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/${tenantSlug}`,
    });
    if (error) return { error: `No se pudo enviar la invitación: ${error.message}` };
    userId = data.user.id;
    invited = true;
  }

  const { error: linkError } = await admin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: userId,
    role,
    invited_by: user.id,
    accepted_at: invited ? null : new Date().toISOString(),
  });

  if (linkError) {
    if (linkError.message.includes("tenant_users_tenant_id_user_id_key")) {
      return { error: "Esa persona ya forma parte de este espacio." };
    }
    return { error: "No se pudo añadir al colaborador." };
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: "team.invite",
    entity: "tenant_users",
    metadata: { email, role },
  });

  revalidatePath(`/${tenantSlug}/team`);
  return {
    ok: invited
      ? `Invitación enviada a ${email}.`
      : `${email} ya tenía cuenta y se ha añadido al espacio.`,
  };
}

export async function changeRole(tenantSlug: string, memberId: string, role: TenantRole) {
  const { role: actorRole, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(actorRole, "team.manage")) {
    throw new Error("No tienes permiso para cambiar roles.");
  }
  if (!user.isSuperadmin && !atLeast(actorRole, role)) {
    throw new Error("No puedes asignar un rol superior al tuyo.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("tenant_users")
    .update({ role })
    .eq("id", memberId);

  if (error) throw new Error("No se pudo cambiar el rol.");
  revalidatePath(`/${tenantSlug}/team`);
}

export async function removeMember(tenantSlug: string, memberId: string) {
  const { tenant, role: actorRole, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(actorRole, "team.manage")) {
    throw new Error("No tienes permiso para expulsar colaboradores.");
  }

  const supabase = await createServerClient();

  // Un espacio sin OWNER queda huérfano: nadie podría volver a invitar ni
  // tocar la facturación. Se comprueba antes de borrar, no después.
  const { data: target } = await supabase
    .from("tenant_users")
    .select("role, user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!target) throw new Error("Ese colaborador ya no existe.");

  if (target.role === "OWNER") {
    const { count } = await supabase
      .from("tenant_users")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("role", "OWNER");

    if ((count ?? 0) <= 1) {
      throw new Error("No puedes eliminar al último propietario del espacio.");
    }
  }

  const { error } = await supabase.from("tenant_users").delete().eq("id", memberId);
  if (error) throw new Error("No se pudo eliminar al colaborador.");

  revalidatePath(`/${tenantSlug}/team`);
}
