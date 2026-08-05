import { requirePermission } from "@/lib/auth/guards";
import { BrandingForm } from "./branding-form";
import { saveBranding, type BrandingState } from "./actions";

export const metadata = { title: "Marca" };

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const { tenant } = await requirePermission(tenantSlug, "branding.manage");

  const save = async (prev: BrandingState, formData: FormData) => {
    "use server";
    return saveBranding(tenantSlug, prev, formData);
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Marca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu logotipo y tus colores se aplican al panel al instante, para ti y
          para todo tu equipo.
        </p>
      </header>

      <BrandingForm
        tenantId={tenant.id}
        tenantName={tenant.name}
        initial={tenant.branding}
        saveAction={save}
      />
    </div>
  );
}
