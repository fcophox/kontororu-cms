import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { TeamList } from "./team-list";
import { addMember, changeRole, removeMember, type TeamState } from "./actions";
import type { TenantRole } from "@/lib/auth/tenant-context";

export const metadata = { title: "Equipo" };

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const { tenant, role, user } = await requirePermission(tenantSlug, "team.manage");

  const supabase = await createServerClient();
  // El `!tenant_users_user_id_fkey` no es opcional: esta tabla tiene DOS
  // claves foráneas a users_profiles (user_id e invited_by) y PostgREST
  // rechaza el embed por ambiguo (PGRST201) si no se le dice cuál.
  const { data: members, error } = await supabase
    .from("tenant_users")
    .select(
      "id, role, accepted_at, suspended_at, created_at, profile:users_profiles!tenant_users_user_id_fkey(id, email, full_name)",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at");

  // Un `?? []` silencioso convierte un error de consulta en "no hay equipo",
  // que es indistinguible de un problema de permisos. Mejor romper.
  if (error) throw new Error(`No se pudo cargar el equipo: ${error.message}`);

  const rows = (members ?? []).map((m) => {
    const profile = m.profile as unknown as {
      id: string;
      email: string;
      full_name: string | null;
    } | null;
    return {
      id: m.id,
      role: m.role as TenantRole,
      email: profile?.email ?? "—",
      fullName: profile?.full_name ?? null,
      isSelf: profile?.id === user.id,
      // Sin `accepted_at`, la invitación se envió pero nadie la aceptó.
      pending: m.accepted_at === null,
      // La pausa la aplica Rukma Studio desde el panel de plataforma. Se
      // muestra aquí porque, si no, esta lista presenta como activo a quien
      // no puede entrar y el espacio parece tener más gente de la que tiene.
      suspended: m.suspended_at !== null,
    };
  });

  const add = async (prev: TeamState, formData: FormData) => {
    "use server";
    return addMember(tenantSlug, prev, formData);
  };
  const setRole = async (memberId: string, next: TenantRole) => {
    "use server";
    await changeRole(tenantSlug, memberId, next);
  };
  const remove = async (memberId: string) => {
    "use server";
    await removeMember(tenantSlug, memberId);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} de {tenant.limits.maxUsers} colaboradores del plan{" "}
          {tenant.plan.toLowerCase()}
        </p>
      </header>

      <TeamList
        members={rows}
        actorRole={user.isSuperadmin ? "OWNER" : role}
        atLimit={rows.length >= tenant.limits.maxUsers}
        canCreateDirectly={user.isSuperadmin}
        addAction={add}
        changeRoleAction={setRole}
        removeAction={remove}
      />
    </div>
  );
}
