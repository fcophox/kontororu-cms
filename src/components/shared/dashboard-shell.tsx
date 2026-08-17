"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  FileText, FolderTree, ImageIcon, Users, LayoutDashboard, Palette, KeyRound, Webhook, Globe, ChevronDown, Puzzle,
} from "lucide-react";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { can, type Permission } from "@/lib/auth/roles";
import { UserProfileButton } from "@/components/user-profile-button";
import { BreadcrumbBar } from "@/components/shared/breadcrumb-bar";

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
  { href: "/addons", label: "Complementos", icon: Puzzle, permission: "addons.manage" },
];

const GROUP_CONFIG: NavItem[] = [
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound, permission: "apiKeys.manage" },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook, permission: "webhooks.manage" },
];

import { usePathname } from "next/navigation";

export function DashboardShell({
  context,
  tenants,
  children,
}: {
  context: TenantContext;
  tenants: { id: string; slug: string; name: string }[];
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (window.innerWidth >= 768) {
      setIsSidebarOpen(true);
    }
  }, []);

  // Cerrar el menú en móvil al navegar
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [pathname]);

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
    <div className="flex h-svh">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 shrink-0 overflow-hidden bg-background transition-transform duration-300 md:static md:translate-x-0 md:transition-[width] ${
          isSidebarOpen ? "translate-x-0 md:w-64 border-r" : "-translate-x-full md:w-0 border-r-0"
        }`}
      >
        <aside className="flex h-full w-64 flex-col bg-background">
          <div className="flex h-16 items-center gap-2 px-4">
          {tenant.branding.logoUrl ? (
            <Image
              src={tenant.branding.logoUrl}
              alt={tenant.name}
              width={28}
              height={28}
              unoptimized /* la URL firmada caduca: optimizarla la cachearía rota */
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
          
          {user.isSuperadmin && tenants.length > 1 && (
            <div className="relative ml-auto">
              <button
                onClick={() => setIsTenantMenuOpen(!isTenantMenuOpen)}
                onBlur={() => setTimeout(() => setIsTenantMenuOpen(false), 200)}
                className="flex items-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Cambiar de cliente"
              >
                <ChevronDown className="size-4" />
              </button>
              
              {isTenantMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-[var(--radius)] border bg-popover p-1 shadow-md z-50">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Clientes ({tenants.length})
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
                    {tenants.map((t) => (
                      <Link
                        key={t.id}
                        href={`/${t.slug}`}
                        className={`block rounded-sm px-2 py-1.5 text-sm truncate ${
                          t.id === tenant.id
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        {t.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
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
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <BreadcrumbBar
          tenantSlug={tenant.slug}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
