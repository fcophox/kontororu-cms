import Link from "next/link";
import Image from "next/image";
import {
  FileText, FolderTree, ImageIcon, Users, LayoutDashboard, Palette, KeyRound, Webhook, Globe,
} from "lucide-react";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { can, type Permission } from "@/lib/auth/roles";
import { UserProfileButton } from "@/components/user-profile-button";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
};

/**
 * Sólo se listan secciones que EXISTEN: un menú es una promesa, y un enlace
 * a una ruta sin página es un 404 con el nombre puesto.
 */
const GROUP_GENERAL: NavItem[] = [
  { href: "", label: "Resumen", icon: LayoutDashboard },
];

const GROUP_GESTION: NavItem[] = [
  { href: "/categories", label: "Categorías", icon: FolderTree, permission: "taxonomy.manage" },
  { href: "/content", label: "Contenido", icon: FileText },
  { href: "/media", label: "Medios", icon: ImageIcon },
];

const GROUP_ADMIN: NavItem[] = [
  { href: "/settings/branding", label: "Marca", icon: Palette, permission: "branding.manage" },
  { href: "/team", label: "Equipo", icon: Users, permission: "team.manage" },
  { href: "/settings/locales", label: "Idiomas", icon: Globe, permission: "branding.manage" },
];

const GROUP_CONFIG: NavItem[] = [
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound, permission: "apiKeys.manage" },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook, permission: "webhooks.manage" },
];

export function DashboardShell({
  context,
  tenants,
  children,
}: {
  context: TenantContext;
  tenants: { id: string; slug: string; name: string }[];
  children: React.ReactNode;
}) {
  const { tenant, role, user } = context;
  const base = `/${tenant.slug}`;

  const filterItems = (items: NavItem[]) =>
    items.filter(
      (item) => !item.permission || user.isSuperadmin || can(role, item.permission),
    );

  const generalItems = filterItems(GROUP_GENERAL);
  const gestionItems = filterItems(GROUP_GESTION);
  const adminItems = filterItems(GROUP_ADMIN);
  const configItems = filterItems(GROUP_CONFIG);

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-background">
        <div className="flex h-16 items-center gap-2 px-4">
          {tenant.branding.logoUrl ? (
            <Image
              src={tenant.branding.logoUrl}
              alt={tenant.name}
              width={28}
              height={28}
              className="rounded"
            />
          ) : (
            <span
              className="grid size-7 place-items-center rounded text-xs font-semibold text-primary-foreground"
              style={{ background: "var(--primary)" }}
            >
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="truncate font-medium">{tenant.name}</span>
        </div>

        <nav className="flex-1 space-y-4 p-2">
          {generalItems.length > 0 && (
            <div className="space-y-0.5">
              {generalItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={`${base}${href}`}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          {gestionItems.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Gestión
              </div>
              {gestionItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={`${base}${href}`}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          {adminItems.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Administración
              </div>
              {adminItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={`${base}${href}`}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          {configItems.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Configuración
              </div>
              {configItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={`${base}${href}`}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="p-2">
          <UserProfileButton
            email={user.email}
            fullName={user.fullName}
            role={role}
            isSuperadmin={user.isSuperadmin}
            tenantSlug={tenant.slug}
          />
          {tenants.length > 1 && (
            <Link
              href="/switch"
              className="mt-2 block px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground rounded"
            >
              Cambiar de espacio ({tenants.length})
            </Link>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
