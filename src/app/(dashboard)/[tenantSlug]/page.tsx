import Link from "next/link";
import { FileText, Send, HardDrive, Users, Package, Shield } from "lucide-react";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { createServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { asUsage } from "@/lib/content/json";

export const metadata = { title: "Resumen" };

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // Memoizado con cache(): esta llamada no repite la consulta del layout.
  const { tenant, role, user } = await getTenantContext(tenantSlug);

  const supabase = await createServerClient();

  const [{ data: usageRaw }, { data: recent }] = await Promise.all([
    supabase.rpc("tenant_usage", { p_tenant: tenant.id }),
    supabase
      .from("posts")
      .select("id, slug, title, status, updated_at")
      .eq("tenant_id", tenant.id)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const usage = asUsage(usageRaw);

  const firstName =
    user.fullName?.split(" ")[0] ?? user.email.split("@")[0];

  const stats = [
    { label: "Contenidos", value: usage.posts, max: tenant.limits.maxPosts, icon: FileText },
    { label: "Colaboradores", value: usage.users, max: tenant.limits.maxUsers, icon: Users },
    {
      label: "Almacenamiento",
      value: `${usage.storageMb.toFixed(1)} MB`,
      max: `${tenant.limits.maxStorageMb} MB`,
      icon: HardDrive,
    },
    { label: "API Keys", value: usage.apiKeys, max: tenant.limits.maxApiKeys, icon: Send },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">
          Hola, <span className="font-medium text-foreground">{firstName}</span>, te damos la bienvenida
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <div className="mt-1.5 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Package className="size-4" />
            Plan {tenant.plan.toLowerCase()}
          </span>
          <span className="opacity-50">·</span>
          <span className="flex items-center gap-1.5">
            <Shield className="size-4" />
            Rol: {role.toLowerCase()}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, max, icon: Icon }) => (
          <div key={label} className="rounded-[var(--radius)] border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">de {max}</div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Actividad reciente</h2>
        <div className="divide-y rounded-[var(--radius)] border bg-card">
          {(recent ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Todavía no hay contenido.{" "}
              <Link href={`/${tenantSlug}/content/new`} className="underline">
                Crea el primero
              </Link>
              .
            </p>
          )}
          {(recent ?? []).map((post) => (
            <Link
              key={post.id}
              href={`/${tenantSlug}/content/${post.id}`}
              className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-accent"
            >
              <span className="truncate">{post.title}</span>
              <StatusBadge status={post.status} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
