import type { Metadata } from "next";
import { getTenantContext, getUserTenants } from "@/lib/auth/tenant-context";
import { TenantTheme } from "@/components/tenant-theme";
import { DashboardShell } from "@/components/shared/dashboard-shell";
import { TenantSuspended } from "@/components/shared/tenant-suspended";

type Props = {
  params: Promise<{ tenantSlug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const { tenant } = await getTenantContext(tenantSlug);
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    icons: tenant.branding.faviconUrl ? { icon: tenant.branding.faviconUrl } : undefined,
  };
}

/**
 * Único punto de la aplicación donde se resuelve el tenant.
 *
 * Todo lo que cuelga de este segmento lo consume vía `getTenantContext()`,
 * que está memoizado por request con `cache()`: llamarlo aquí y en cada page
 * anidada cuesta una sola consulta.
 *
 * El theming se inyecta aquí, en servidor, para que los colores del cliente
 * viajen en el HTML inicial. Hacerlo en un `useEffect` produciría medio
 * segundo de gris Rukma antes de la marca del cliente en cada navegación dura.
 */
export default async function TenantLayout({ params, children }: Props) {
  const { tenantSlug } = await params;
  const [ctx, tenants] = await Promise.all([
    getTenantContext(tenantSlug),
    getUserTenants(),
  ]);

  // El SuperAdmin sí entra a un espacio suspendido: necesita poder dar
  // soporte y reactivarlo, que es justo cuando el cliente llama.
  // Se guarda el estado en sí, no un booleano: así TypeScript lo estrecha al
  // par SUSPENDED|CANCELLED dentro de la rama.
  const blockedStatus =
    !ctx.user.isSuperadmin &&
    (ctx.tenant.status === "SUSPENDED" || ctx.tenant.status === "CANCELLED")
      ? ctx.tenant.status
      : null;

  return (
    <TenantTheme branding={ctx.tenant.branding}>
      {blockedStatus ? (
        <TenantSuspended tenantName={ctx.tenant.name} status={blockedStatus} />
      ) : (
        <DashboardShell context={ctx} tenants={tenants}>
          {children}
        </DashboardShell>
      )}
    </TenantTheme>
  );
}
