import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { getTenantAddon } from "@/lib/addons/queries";
import { parsePortfolioSettings } from "@/lib/addons/portfolio";
import { PortfolioSettingsDrawer } from "./portfolio-settings";
import { PortfolioCreateButton } from "./portfolio-item-drawer";
import { PortfolioGrid } from "./portfolio-grid";
import {
  createPortfolioItem,
  deletePortfolioItem,
  savePortfolioSettings,
  updatePortfolioItem,
  type PortfolioState,
} from "./actions";

export const metadata = { title: "Portfolio" };

export default async function PortfolioAddonPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requirePermission(tenantSlug, "addons.manage");

  // Misma regla que el resto de complementos: sin activar, la pantalla no
  // existe. Así desactivar cierra de verdad la puerta, no sólo el enlace.
  const addon = await getTenantAddon(tenant.id, "portfolio");
  if (!addon?.isEnabled) notFound();

  const settings = parsePortfolioSettings(addon.settings);

  // Lo ya escrito por el cliente, para sugerirlo en el formulario: una
  // categoría tecleada dos veces con distinta mayúscula son dos categorías.
  const categories = [...new Set(settings.items.map((i) => i.category).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  const save = async (prev: PortfolioState, formData: FormData) => {
    "use server";
    return savePortfolioSettings(tenantSlug, prev, formData);
  };

  const create = async (prev: PortfolioState, formData: FormData) => {
    "use server";
    return createPortfolioItem(tenantSlug, prev, formData);
  };

  const update = async (prev: PortfolioState, formData: FormData) => {
    "use server";
    return updatePortfolioItem(tenantSlug, prev, formData);
  };

  const remove = async (id: string) => {
    "use server";
    return deletePortfolioItem(tenantSlug, id);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <Link
        href={`/${tenantSlug}/addons`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Complementos
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un espacio propio para los trabajos que quieres mostrar en tu web,
            con su orden y su ficha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PortfolioSettingsDrawer initial={settings} saveAction={save} />
          <PortfolioCreateButton
            tenantId={tenant.id}
            categories={categories}
            createAction={create}
          />
        </div>
      </header>

      <PortfolioGrid
        items={settings.items}
        tenantId={tenant.id}
        categories={categories}
        updateAction={update}
        deleteAction={remove}
      />
    </div>
  );
}
