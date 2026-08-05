import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { asLimits } from "@/lib/content/json";
import { formatBytes, usageRatio, STATUS_LABELS, PLANS, type TenantStatus } from "@/lib/auth/plans";
import { NewTenantForm } from "./new-tenant-form";
import { createTenant } from "./actions";

const STATUS_STYLES: Record<TenantStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  TRIAL: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  SUSPENDED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default async function TenantsPage() {
  const supabase = await createServerClient();

  const { data: tenants, error } = await supabase
    .from("platform_tenant_overview")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`);

  const rows = tenants ?? [];
  const operational = rows.filter((t) => t.status === "ACTIVE" || t.status === "TRIAL").length;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} espacios · {operational} operativos
          </p>
        </div>
      </header>

      <NewTenantForm createAction={createTenant} />

      <div className="overflow-x-auto rounded-[var(--radius)] border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Cliente</th>
              <th className="p-3 font-medium">Estado</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Contenido</th>
              <th className="p-3 font-medium">Equipo</th>
              <th className="p-3 font-medium">Almacenamiento</th>
              <th className="p-3 font-medium">Última actividad</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Todavía no hay clientes. Da de alta el primero arriba.
                </td>
              </tr>
            )}

            {rows.map((t) => {
              const limits = asLimits(t.limits);
              const storageMb = Number(t.storage_bytes ?? 0) / 1048576;
              const status = t.status as TenantStatus;

              return (
                <tr key={t.id} className="hover:bg-accent/50">
                  <td className="p-3">
                    <Link href={`/admin/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">/{t.slug}</p>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {PLANS[t.plan as keyof typeof PLANS]?.label ?? t.plan}
                  </td>
                  <td className="p-3">
                    <UsageCell
                      used={Number(t.posts_count ?? 0)}
                      limit={limits.maxPosts}
                      detail={`${t.published_count ?? 0} publicados`}
                    />
                  </td>
                  <td className="p-3">
                    <UsageCell used={Number(t.users_count ?? 0)} limit={limits.maxUsers} />
                  </td>
                  <td className="p-3">
                    <UsageCell
                      used={storageMb}
                      limit={limits.maxStorageMb}
                      label={formatBytes(Number(t.storage_bytes ?? 0))}
                    />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {t.last_activity_at
                      ? new Date(t.last_activity_at).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                        })
                      : "sin actividad"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Celda de consumo con barra. El color avisa antes de que el cliente llame:
 * ámbar al 80 %, rojo al llegar al límite.
 */
function UsageCell({
  used,
  limit,
  label,
  detail,
}: {
  used: number;
  limit: number;
  label?: string;
  detail?: string;
}) {
  const ratio = usageRatio(used, limit);
  const tone =
    ratio >= 100 ? "bg-red-500" : ratio >= 80 ? "bg-amber-500" : "bg-muted-foreground/40";

  return (
    <div className="min-w-24">
      <div className="flex items-baseline gap-1 text-xs">
        <span className="tabular-nums">{label ?? Math.round(used)}</span>
        <span className="text-muted-foreground">/ {limit}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${ratio}%` }} />
      </div>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}
