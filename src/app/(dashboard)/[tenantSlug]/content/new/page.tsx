import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { PostEditor } from "@/components/editor/post-editor";
import { saveContent, type ActionState } from "../actions";

export const metadata = { title: "Nueva entrada" };

export default async function NewContentPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const { tenant } = await requirePermission(tenantSlug, "content.create");

  const supabase = await createServerClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .order("position");

  // Se ata el tenantSlug a la acción en servidor. Si viajara como campo del
  // formulario, el cliente podría cambiarlo — y aunque RLS lo rechazaría,
  // el guard de rol se estaría evaluando contra el tenant equivocado.
  const save = async (prev: ActionState, formData: FormData) => {
    "use server";
    return saveContent(tenantSlug, prev, formData);
  };

  return (
    <PostEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      categories={categories ?? []}
      canPublish={false} // aún no existe: primero hay que guardarlo
      saveAction={save}
      draft={{
        title: "",
        excerpt: "",
        categoryId: null,
        coverMediaId: null,
        coverUrl: null,
        contentJson: { type: "doc", content: [] },
        customFields: {},
        seo: {},
        status: "DRAFT",
        publishedAt: null,
      }}
    />
  );
}
