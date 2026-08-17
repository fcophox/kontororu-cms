"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/tenant-context";
import { PLANS, TENANT_STATUSES } from "@/lib/auth/plans";
import { slugify } from "@/lib/content/slug";
import type { Json } from "@/lib/supabase/types";

/**
 * Acciones del panel de plataforma (Rukma Studio).
 *
 * Todas comprueban `is_superadmin` ANTES de tocar nada. Por debajo RLS lo
 * vuelve a comprobar, pero varias usan `service_role` para crear cuentas —
 * y ahí RLS ya no protege, así que el guard de aquí es la única barrera.
 */
async function requireSuperadmin() {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) {
    throw new Error("Sólo el equipo de Rukma Studio puede hacer esto.");
  }
  return user;
}

export type PlatformState = { error?: string; ok?: string };

// ---------------------------------------------------------------------
// Alta de cliente
// ---------------------------------------------------------------------
const CreateTenantInput = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  slug: z
    .string()
    .trim()
    .min(2, "El identificador es demasiado corto")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones"),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
  ownerEmail: z.string().trim().toLowerCase().email("Email del propietario no válido"),
});

/**
 * Da de alta un cliente completo: tenant + propietario invitado.
 *
 * Es la operación que hoy exigía entrar por SQL. Va en un solo paso porque un
 * tenant sin propietario es inútil y nadie puede entrar a arreglarlo: si la
 * invitación falla, se deshace el tenant en vez de dejar un cascarón huérfano
 * ocupando el slug.
 */
export async function createTenant(
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();

  const parsed = CreateTenantInput.safeParse({
    name: rawName,
    // Si no se escribe identificador, se deriva del nombre.
    slug: rawSlug || slugify(rawName),
    plan: formData.get("plan"),
    ownerEmail: formData.get("ownerEmail"),
  });

  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }

  const actor = await requireSuperadmin();
  const { name, slug, plan, ownerEmail } = parsed.data;

  // Estos slugs colisionarían con rutas propias de la aplicación.
  const RESERVED = ["admin", "api", "auth", "login", "switch", "settings", "_next"];
  if (RESERVED.includes(slug)) {
    return { error: `"${slug}" está reservado: elige otro identificador.` };
  }

  const admin = createServiceClient();

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name,
      slug,
      plan,
      status: "TRIAL",
      limits: PLANS[plan].limits as unknown as Json,
    })
    .select("id")
    .single();

  if (tenantError) {
    if (tenantError.message.includes("tenants_slug_key")) {
      return { error: `El identificador "${slug}" ya está en uso.` };
    }
    return { error: "No se pudo crear el espacio." };
  }

  // Propietario: se reutiliza la cuenta si ya existe (una agencia puede
  // llevar varios clientes con el mismo email).
  const { data: existing } = await admin
    .from("users_profiles")
    .select("id")
    .eq("email", ownerEmail)
    .maybeSingle();

  let ownerId = existing?.id ?? null;

  if (!ownerId) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      ownerEmail,
      { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/${slug}` },
    );

    if (inviteError) {
      // Sin propietario el espacio no sirve y bloquearía el slug para siempre.
      await admin.from("tenants").delete().eq("id", tenant.id);
      return { error: `No se pudo invitar al propietario: ${inviteError.message}` };
    }
    ownerId = invited.user.id;
  }

  const { error: memberError } = await admin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: ownerId,
    role: "OWNER",
    invited_by: actor.id,
    accepted_at: existing ? new Date().toISOString() : null,
  });

  if (memberError) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return { error: "No se pudo asignar el propietario." };
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: actor.id,
    action: "tenant.create",
    entity: "tenants",
    entity_id: tenant.id,
    metadata: { slug, plan, ownerEmail },
  });

  revalidatePath("/admin");
  redirect(`/admin/${tenant.id}`);
}

// ---------------------------------------------------------------------
// Estado, plan y límites
// ---------------------------------------------------------------------
export async function setTenantStatus(tenantId: string, status: string) {
  const actor = await requireSuperadmin();

  if (!(TENANT_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Estado no válido.");
  }

  // Cliente con sesión, no service_role: aquí RLS y el trigger de columnas
  // SÍ deben intervenir. Que un SuperAdmin pueda hacerlo es exactamente lo
  // que comprueban los tests de escalada de privilegios.
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("tenants")
    .update({ status: status as never })
    .eq("id", tenantId);

  if (error) throw new Error("No se pudo cambiar el estado.");

  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_id: actor.id,
    action: "tenant.status",
    entity: "tenants",
    entity_id: tenantId,
    metadata: { status },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${tenantId}`);
}

// ---------------------------------------------------------------------
// Colaboradores de un cliente
//
// Rukma Studio actúa aquí en nombre del cliente: alguien pierde el acceso a
// su cuenta, se va de la empresa, o hay que cortar de urgencia. Todo pasa
// por el cliente con sesión —no service_role— para que RLS y los triggers
// sigan siendo la barrera real y quede rastro en audit_logs.
// ---------------------------------------------------------------------

/**
 * Estas acciones devuelven el error en vez de lanzarlo.
 *
 * Un `throw` dentro de un Server Action llega al navegador como "an error
 * occurred in the Server Components render" en producción: el motivo real
 * —"es el último propietario"— se pierde justo cuando explica por qué el
 * botón no hizo nada.
 */
const MEMBER_ROLES = ["OWNER", "ADMIN", "EDITOR", "CONTRIBUTOR"] as const;

/**
 * Un espacio sin ningún OWNER activo queda huérfano: nadie puede invitar,
 * cambiar roles ni tocar la facturación, y recuperarlo exige entrar por SQL.
 * Pausar o degradar al último propietario provoca exactamente eso, así que
 * se bloquea igual que eliminarlo.
 */
async function lastOwnerBlock(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  tenantId: string,
  memberId: string,
  verb: string,
): Promise<string | null> {
  const { data: target } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("id", memberId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!target) return "Ese colaborador ya no está en el espacio.";
  if (target.role !== "OWNER") return null;

  const { count } = await supabase
    .from("tenant_users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "OWNER")
    .is("suspended_at", null);

  return (count ?? 0) <= 1
    ? `No puedes ${verb} al último propietario activo del espacio.`
    : null;
}

export async function setMemberRole(
  tenantId: string,
  memberId: string,
  role: string,
): Promise<PlatformState> {
  const actor = await requireSuperadmin();

  if (!(MEMBER_ROLES as readonly string[]).includes(role)) {
    return { error: "Rol no válido." };
  }

  const supabase = await createServerClient();

  // Degradar al último OWNER deja el espacio sin propietario igual que
  // borrarlo, sólo que en silencio.
  if (role !== "OWNER") {
    const blocked = await lastOwnerBlock(supabase, tenantId, memberId, "degradar");
    if (blocked) return { error: blocked };
  }

  const { error } = await supabase
    .from("tenant_users")
    .update({ role: role as never })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo cambiar el rol." };

  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_id: actor.id,
    action: "member.role",
    entity: "tenant_users",
    entity_id: memberId,
    metadata: { role },
  });

  revalidatePath(`/admin/${tenantId}`);
  return { ok: "Rol actualizado." };
}

/**
 * Pausa o reactiva a un colaborador.
 *
 * `suspended_at` no es una etiqueta: los helpers de RLS ignoran las
 * membresías pausadas, así que el acceso se corta en la base de datos —
 * también para sus llamadas directas a la API, no sólo en el panel.
 */
export async function setMemberSuspended(
  tenantId: string,
  memberId: string,
  suspended: boolean,
): Promise<PlatformState> {
  const actor = await requireSuperadmin();
  const supabase = await createServerClient();

  if (suspended) {
    const blocked = await lastOwnerBlock(supabase, tenantId, memberId, "pausar");
    if (blocked) return { error: blocked };
  }

  const { error } = await supabase
    .from("tenant_users")
    .update({ suspended_at: suspended ? new Date().toISOString() : null })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo cambiar el acceso del colaborador." };

  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_id: actor.id,
    action: suspended ? "member.suspend" : "member.restore",
    entity: "tenant_users",
    entity_id: memberId,
    metadata: {},
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${tenantId}`);
  return { ok: suspended ? "Acceso pausado." : "Acceso restablecido." };
}

/**
 * Saca a alguien del espacio. Borra la membresía, no la cuenta: la misma
 * persona puede colaborar con otros clientes, y eliminar su usuario de
 * `auth` desde aquí les dejaría fuera de todos.
 */
export async function removeMember(
  tenantId: string,
  memberId: string,
): Promise<PlatformState> {
  const actor = await requireSuperadmin();
  const supabase = await createServerClient();

  const blocked = await lastOwnerBlock(supabase, tenantId, memberId, "eliminar");
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .from("tenant_users")
    .delete()
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo eliminar al colaborador." };

  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_id: actor.id,
    action: "member.remove",
    entity: "tenant_users",
    entity_id: memberId,
    metadata: {},
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${tenantId}`);
  return { ok: "Colaborador eliminado del espacio." };
}

const LimitsInput = z.object({
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
  maxUsers: z.coerce.number().int().min(1).max(10_000),
  maxPosts: z.coerce.number().int().min(1).max(1_000_000),
  maxStorageMb: z.coerce.number().int().min(1).max(5_000_000),
  maxApiKeys: z.coerce.number().int().min(1).max(1_000),
});

export async function updatePlanAndLimits(
  tenantId: string,
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const parsed = LimitsInput.safeParse({
    plan: formData.get("plan"),
    maxUsers: formData.get("maxUsers"),
    maxPosts: formData.get("maxPosts"),
    maxStorageMb: formData.get("maxStorageMb"),
    maxApiKeys: formData.get("maxApiKeys"),
  });

  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Valores no válidos" };
  }

  const actor = await requireSuperadmin();
  const { plan, ...limits } = parsed.data;

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("tenants")
    .update({ plan: plan as never, limits: limits as unknown as Json })
    .eq("id", tenantId);

  if (error) return { error: "No se pudieron guardar los límites." };

  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_id: actor.id,
    action: "tenant.plan",
    entity: "tenants",
    entity_id: tenantId,
    metadata: { plan, ...limits },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${tenantId}`);
  return { ok: "Plan y límites actualizados." };
}
