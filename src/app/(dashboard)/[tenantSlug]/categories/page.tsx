import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { CategoryList } from "./category-list";
import { createCategory, deleteCategory, type CategoryState } from "./actions";

export const metadata = { title: "Categorías" };

const KIND_LABELS: Record<string, string> = {
  BLOG: "Blog",
  CASE_STUDY: "Casos de Estudio",
  SERVICE: "Servicios",
  CUSTOM: "Personalizada",
};

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const {  } = await requirePermission(tenantSlug, "taxonomy.manage");

  const supabase = await createServerClient();

  // Conteo de posts por categoría: sin él, borrar es una decisión a ciegas.
  const [{ data: categories }, { data: posts }] = await Promise.all([
    supabase.from("categories").select("id, name, slug, kind, description").order("position"),
    supabase.from("posts").select("category_id").is("deleted_at", null),
  ]);

  const counts = new Map<string, number>();
  for (const p of posts ?? []) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }

  const create = async (prev: CategoryState, formData: FormData) => {
    "use server";
    return createCategory(tenantSlug, prev, formData);
  };
  const remove = async (id: string) => {
    "use server";
    await deleteCategory(tenantSlug, id);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organizan el contenido y determinan cómo lo filtra la API.
        </p>
      </header>

      <CategoryList
        categories={(categories ?? []).map((c) => ({
          ...c,
          kindLabel: KIND_LABELS[c.kind] ?? c.kind,
          postCount: counts.get(c.id) ?? 0,
        }))}
        createAction={create}
        deleteAction={remove}
      />
    </div>
  );
}
