"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  LayoutDashboard,
  FolderTree,
  FileText,
  ImageIcon,
  Users,
  Palette,
  KeyRound,
  Webhook,
  Globe,
  UserRound,
  Puzzle,
} from "lucide-react";
import { findAddon } from "@/lib/addons/catalog";

type SegmentMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SEGMENTS: Record<string, SegmentMeta> = {
  categories: { label: "Categorías", icon: FolderTree },
  content: { label: "Contenido", icon: FileText },
  media: { label: "Medios", icon: ImageIcon },
  team: { label: "Equipo", icon: Users },
  profile: { label: "Perfil", icon: UserRound },
  addons: { label: "Complementos", icon: Puzzle },
  branding: { label: "Marca", icon: Palette },
  "api-keys": { label: "API Keys", icon: KeyRound },
  webhooks: { label: "Webhooks", icon: Webhook },
  locales: { label: "Idiomas", icon: Globe },
  new: { label: "Nuevo", icon: FileText },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Crumb = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
};

export function BreadcrumbBar({
  tenantSlug,
  onToggleSidebar,
  isSidebarOpen = false,
}: {
  tenantSlug: string;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}) {
  const pathname = usePathname();
  const base = `/${tenantSlug}`;
  const rest = pathname.slice(base.length).replace(/^\//, "");
  const rawSegments = rest ? rest.split("/") : [];

  const crumbs: Crumb[] = [];

  if (rawSegments.length === 0) {
    // On the overview / home page
    crumbs.push({ label: "Resumen", icon: LayoutDashboard, href: base });
  } else {
    let path = base;
    for (const [i, seg] of rawSegments.entries()) {
      path += `/${seg}`;
      const meta = SEGMENTS[seg];
      // El nombre y el icono de cada complemento salen del catálogo, no de
      // una copia aquí: así una alta o un renombrado se refleja solo.
      const addon =
        rawSegments[i - 1] === "addons" ? findAddon(seg) : undefined;
      if (meta) {
        crumbs.push({ ...meta, href: path });
      } else if (addon) {
        crumbs.push({ label: addon.name, icon: addon.icon, href: path });
      } else if (UUID_RE.test(seg)) {
        // Dynamic post IDs → show "Editar"
        crumbs.push({ label: "Editar", icon: FileText, href: path });
      }
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label={
          isSidebarOpen ? "Colapsar barra lateral" : "Abrir barra lateral"
        }
        aria-expanded={isSidebarOpen}
      >
        {isSidebarOpen ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <PanelLeftOpen className="size-4" />
        )}
      </button>
      <div className="h-4 w-px bg-border" />
      <nav
        className="flex items-center gap-1.5 text-sm"
        aria-label="Breadcrumb"
      >
        {crumbs.map((crumb, i) => {
          const Icon = crumb.icon;
          const isLast = i === crumbs.length - 1;

          return (
            <Fragment key={crumb.href}>
              {i > 0 && (
                <ChevronRight className="size-3 text-muted-foreground/40" />
              )}
              {isLast ? (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Icon className="size-4 text-muted-foreground" />
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-4" />
                  {crumb.label}
                </Link>
              )}
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}
