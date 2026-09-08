"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getTenantContext, type TenantRole } from "@/lib/auth/tenant-context";
import { can, atLeast } from "@/lib/auth/guards";

const Base = {
  email: z.string().trim().toLowerCase().email("Email no válido"),
  role: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR"]),
  fullName: z.string().trim().max(80).optional().or(z.literal("")),
};

/**
 * Dos formas de sumar a alguien al espacio:
 *
 *   · `invite` — se le manda un correo y la cuenta no existe hasta que lo
 *     abre. Es lo correcto cuando la persona es quien elige su contraseña.
 *   · `direct` — se crea la cuenta aquí mismo, ya confirmada, con una
 *     contraseña que fija quien da el alta. Sirve para altas presenciales y
 *     para clientes cuyo correo corporativo filtra los emails del sistema.
 *     Reservado a SuperAdmin: durante un rato hay dos personas que conocen
 *     esa contraseña, y eso no es una capacidad que deba tener el ADMIN de
 *     un espacio sobre las cuentas de su equipo.
 */
const AddMemberInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("invite"), ...Base }),
  z.object({
    mode: z.literal("direct"),
    ...Base,
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  }),
]);

export type TeamState = { error?: string; ok?: string };

/**
 * Añade un colaborador al tenant, por invitación o por alta directa.
 *
 * Requiere `service_role` porque hay que crear (o localizar) una cuenta en
 * `auth.users`, algo que la anon key no puede hacer. Todo lo demás —quién
 * añade, a qué tenant, con qué rol— se valida ANTES de tocar el cliente
 * privilegiado: a partir de ahí RLS ya no protege nada.
 */
export async function addMember(
  tenantSlug: string,
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const parsed = AddMemberInput.safeParse({
    mode: formData.get("mode") ?? "invite",
    email: formData.get("email"),
    role: formData.get("role"),
    fullName: formData.get("fullName") ?? "",
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }
  const input = parsed.data;
  const { email, role } = input;
  const fullName = input.fullName?.trim() || null;

  const { tenant, role: actorRole, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(actorRole, "team.manage")) {
    return { error: "No tienes permiso para añadir colaboradores." };
  }

  // Nadie añade por encima de su propio nivel: un ADMIN no crea un OWNER.
  if (!user.isSuperadmin && !atLeast(actorRole, role as TenantRole)) {
    return { error: "No puedes asignar un rol superior al tuyo." };
  }

  // Fijarle la contraseña a otra persona sólo lo hace Rukma Studio. Quien
  // administra un espacio invita: así la contraseña la conoce únicamente su
  // dueño. La UI ya oculta el modo, pero esconderlo no es restringirlo.
  if (input.mode === "direct" && !user.isSuperadmin) {
    return {
      error:
        "El alta directa con contraseña la realiza Rukma Studio. Envía una invitación por email.",
    };
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
  // `created` = cuenta nueva y ya utilizable. `invited` = cuenta nueva a la
  // espera de que abran el correo. Se distinguen porque el mensaje que ve
  // quien administra es distinto: en un caso hay que entregar la contraseña.
  let created = false;
  let invited = false;

  if (!userId) {
    if (input.mode === "direct") {
      // `email_confirm: true` es la pieza del alta directa: marca el correo
      // como verificado sin mandar nada, así que la persona puede entrar por
      // /login inmediatamente. Sin esto la cuenta existe pero no autentica.
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      });
      if (error) return { error: `No se pudo crear la cuenta: ${error.message}` };
      userId = data.user.id;
      created = true;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/${tenantSlug}`,
        data: fullName ? { full_name: fullName } : undefined,
      });
      if (error) return { error: `No se pudo enviar la invitación: ${error.message}` };
      userId = data.user.id;
      invited = true;
    }
  }

  const { error: linkError } = await admin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: userId,
    role,
    invited_by: user.id,
    // Sólo queda pendiente lo que depende de que alguien abra un correo.
    accepted_at: invited ? null : new Date().toISOString(),
  });

  if (linkError) {
    // La cuenta recién creada se queda sin espacio al que entrar: se deshace
    // en vez de dejar un usuario huérfano que bloquea el email para siempre.
    if (created) await admin.auth.admin.deleteUser(userId);

    if (linkError.message.includes("tenant_users_tenant_id_user_id_key")) {
      return { error: "Esa persona ya forma parte de este espacio." };
    }
    return { error: "No se pudo añadir al colaborador." };
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: created ? "team.create" : "team.invite",
    entity: "tenant_users",
    metadata: { email, role, mode: input.mode },
  });

  revalidatePath(`/${tenantSlug}/team`);

  if (created) {
    return { ok: `Cuenta creada para ${email}. Ya puede entrar con la contraseña que has definido.` };
  }
  if (invited) return { ok: `Invitación enviada a ${email}.` };
  return {
    ok: `${email} ya tenía cuenta y se ha añadido al espacio${
      input.mode === "direct" ? " — conserva su contraseña actual." : "."
    }`,
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
