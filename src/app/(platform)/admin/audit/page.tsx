import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  "tenant.create": "Alta de cliente",
  "tenant.status": "Cambio de estado",
  "tenant.plan": "Cambio de plan o límites",
  "team.invite": "Invitación a colaborador",
  "team.create": "Alta directa de colaborador",
  "member.create": "Alta directa desde plataforma",
  "api_key.create": "API key creada",
  "api_key.revoke": "API key revocada",
  "post.publish": "Contenido publicado",
};

/**
 * Registro global de acciones sensibles, en todos los clientes.
 *
 * Se lee de `audit_logs` con la sesión del SuperAdmin: la política de esa
 * tabla ya le deja verlo todo, así que no hace falta `service_role` — y no
 * usarlo significa que un fallo del guard del layout no expondría nada.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tenant?: string }>;
}) {
  const { page = "1", tenant } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const from = (current - 1) * PAGE_SIZE;

  const supabase = await createServerClient();

  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, entity, entity_id, metadata, created_at, tenant:tenants(slug, name), actor:users_profiles(email)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (tenant) query = query.eq("tenant_id", tenant);

  const { data: logs, count, error } = await query;
  if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Actividad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count ?? 0} acciones registradas
          {tenant ? " en este cliente" : " en toda la plataforma"}
        </p>
      </header>

      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {(logs ?? []).length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Sin actividad registrada todavía.
          </p>
        )}

        {(logs ?? []).map((log) => {
          const t = log.tenant as unknown as { slug: string; name: string } | null;
          const actor = log.actor as unknown as { email: string } | null;

          return (
            <div key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm">
              <span className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>

              {t && (
                <Link
                  href={`/admin/audit?tenant=${(log as { tenant_id?: string }).tenant_id ?? ""}`}
                  className="text-muted-foreground hover:underline"
                >
                  {t.name}
                </Link>
              )}

              <span className="text-xs text-muted-foreground">{actor?.email ?? "sistema"}</span>

              <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString("es-ES", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>

              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <code className="w-full overflow-x-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {JSON.stringify(log.metadata)}
                </code>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={`/admin/audit?page=${current - 1}`} className="hover:underline">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {current} de {totalPages}
          </span>
          {current < totalPages ? (
            <Link href={`/admin/audit?page=${current + 1}`} className="hover:underline">
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
