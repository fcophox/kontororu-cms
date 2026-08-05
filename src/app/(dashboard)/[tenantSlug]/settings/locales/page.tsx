import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { LocalesForm } from "./locales-form";
import { saveLocales, type LocalesState } from "./actions";

export const metadata = { title: "Idiomas" };

export default async function LocalesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requirePermission(tenantSlug, "branding.manage");

  const supabase = await createServerClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("locale")
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null);

  const counts: Record<string, number> = {};
  for (const p of posts ?? []) counts[p.locale] = (counts[p.locale] ?? 0) + 1;

  const save = async (prev: LocalesState, formData: FormData) => {
    "use server";
    return saveLocales(tenantSlug, prev, formData);
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Idiomas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada idioma es una versión completa del contenido, con su propia URL,
          su SEO y su estado de publicación.
        </p>
      </header>

      <LocalesForm
        active={tenant.locales}
        defaultLocale={tenant.defaultLocale}
        counts={counts}
        saveAction={save}
      />
    </div>
  );
}
