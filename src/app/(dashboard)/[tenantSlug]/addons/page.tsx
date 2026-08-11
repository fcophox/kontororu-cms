import { requirePermission } from "@/lib/auth/guards";
import { ADDONS } from "@/lib/addons/catalog";
import { getTenantAddons } from "@/lib/addons/queries";
import { AddonList, type AddonCard } from "./addon-list";
import { toggleAddon } from "./actions";

export const metadata = { title: "Complementos" };

export default async function AddonsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requirePermission(tenantSlug, "addons.manage");

  const state = await getTenantAddons(tenant.id);

  // El catálogo manda: se recorre él, no las filas. Así un complemento nuevo
  // aparece sin tocar la base, y una fila de un complemento retirado no
  // dibuja una tarjeta que no lleva a ninguna parte.
  const cards: AddonCard[] = ADDONS.map((addon) => ({
    key: addon.key,
    name: addon.name,
    summary: addon.summary,
    description: addon.description,
    priceLabel: addon.priceLabel,
    actionLabel: addon.actionLabel,
    configHref: addon.configPath ? `/${tenantSlug}${addon.configPath}` : null,
    isEnabled: state[addon.key]?.isEnabled ?? false,
  }));

  const toggle = async (key: string, enabled: boolean) => {
    "use server";
    await toggleAddon(tenantSlug, key, enabled);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Complementos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Funcionalidades desarrolladas por Rukma Studio que amplían tu espacio.
          Actívalas cuando las necesites y desactívalas sin perder lo configurado.
        </p>
      </header>

      <AddonList addons={cards} toggleAction={toggle} />
    </div>
  );
}
