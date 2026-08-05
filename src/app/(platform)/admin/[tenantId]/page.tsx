import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { asLimits } from "@/lib/content/json";
import { formatBytes, PLANS, type TenantStatus } from "@/lib/auth/plans";
import { TenantControls } from "./tenant-controls";
import { updatePlanAndLimits, setTenantStatus, type PlatformState } from "../actions";

type Props = { params: Promise<{ tenantId: string }> };

export default async function TenantDetailPage({ params }: Props) {
  const { tenantId } = await params;
  const supabase = await createServerClient();

  const [{ data: tenant }, { data: members }, { data: activity }] = await Promise.all([
    supabase.from("platform_tenant_overview").select("*").eq("id", tenantId).maybeSingle(),
    supabase
      .from("tenant_users")
      .select("id, role, accepted_at, profile:users_profiles!tenant_users_user_id_fkey(email, full_name)")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabase
      .from("audit_logs")
      .select("id, action, entity, metadata, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Postgres no garantiza NOT NULL en las columnas de una vista, así que los
  // tipos generados las marcan nullables. Se estrechan aquí, en el borde.
  if (!tenant?.slug || !tenant.created_at) notFound();

  const limits = asLimits(tenant.limits);
  const status = tenant.status as TenantStatus;

  const save = async (prev: PlatformState, formData: FormData) => {
    "use server";
    return updatePlanAndLimits(tenantId, prev, formData);
  };
  const changeStatus = async (next: string) => {
    "use server";
    await setTenantStatus(tenantId, next);
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clientes
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          /{tenant.slug} · alta el{" "}
          {new Date(tenant.created_at).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Entradas" value={`${tenant.posts_count} / ${limits.maxPosts}`} />
        <Stat label="Publicadas" value={String(tenant.published_count)} />
        <Stat
          label="Almacenamiento"
          value={formatBytes(Number(tenant.storage_bytes ?? 0))}
          hint={`de ${limits.maxStorageMb} MB`}
        />
        <Stat
          label="API keys"
          value={`${tenant.api_keys_count} / ${limits.maxApiKeys}`}
        />
      </section>

      <TenantControls
        tenantSlug={tenant.slug}
        status={status}
        plan={tenant.plan as keyof typeof PLANS}
        limits={limits}
        saveAction={save}
        statusAction={changeStatus}
      />

      <section>
        <h2 className="mb-2 font-medium">
          Equipo{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({members?.length ?? 0} de {limits.maxUsers})
          </span>
        </h2>
        <div className="divide-y rounded-[var(--radius)] border bg-card">
          {(members ?? []).map((m) => {
            const profile = m.profile as unknown as {
              email: string;
              full_name: string | null;
            } | null;
            return (
              <div key={m.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {profile?.full_name ?? profile?.email ?? "—"}
                  {profile?.full_name && (
                    <span className="ml-2 text-xs text-muted-foreground">{profile.email}</span>
                  )}
                </span>
                {m.accepted_at === null && (
                  <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                    invitación pendiente
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{m.role}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Actividad reciente</h2>
        <div className="divide-y rounded-[var(--radius)] border bg-card">
          {(activity ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Sin actividad registrada.</p>
          )}
          {(activity ?? []).map((log) => (
            <div key={log.id} className="flex items-baseline gap-3 p-3 text-sm">
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</code>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{log.entity}</span>
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString("es-ES", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
