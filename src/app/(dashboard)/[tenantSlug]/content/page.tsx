import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { createServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/guards";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asContentStatus } from "@/lib/content/json";
import { localeLabel } from "@/lib/content/locales";
import { TrashActions } from "./trash-actions";
import { restoreContent, purgeContent } from "./actions";

export const metadata = { title: "Contenido" };

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: "", label: "Todos" },
  { value: "DRAFT", label: "Borradores" },
  { value: "PUBLISHED", label: "Publicados" },
  { value: "ARCHIVED", label: "Archivados" },
];

type SearchParams = {
  status?: string;
  q?: string;
  category?: string;
  page?: string;
  /** `trash` cambia la vista entera: la papelera no es un estado más. */
  view?: string;
  locale?: string;
};

export default async function ContentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tenantSlug } = await params;
  const { status = "", q = "", category = "", page = "1", view, locale } = await searchParams;
  const isTrash = view === "trash";

  const { tenant, role, user } = await getTenantContext(tenantSlug);

  // Sin filtro se ven TODOS los idiomas: dentro del CMS interesa el inventario
  // completo, al contrario que en la API, donde mezclarlos duplicaría listados.
  const localeFilter = locale && tenant.locales.includes(locale) ? locale : null;
  const supabase = await createServerClient();

  const current = Math.max(1, Number(page) || 1);
  const from = (current - 1) * PAGE_SIZE;

  let query = supabase
    .from("posts")
    .select(
      "id, slug, title, excerpt, status, published_at, updated_at, locale, category:categories(id, name)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // La papelera es `deleted_at`, no un `status`: son ejes distintos y un
  // contenido archivado puede estar además en la papelera.
  query = isTrash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  // No hace falta filtrar por tenant_id: RLS ya lo hace. Añadirlo aquí daría
  // una falsa sensación de que es este filtro el que aísla los datos.
  // El status viene de la query string: se valida contra el enum antes de
  // usarlo como filtro, en vez de confiar en que sea un valor legítimo.
  const statusFilter = status ? asContentStatus(status) : null;
  if (statusFilter) query = query.eq("status", statusFilter);
  if (localeFilter) query = query.eq("locale", localeFilter);
  if (category) query = query.eq("category_id", category);
  if (q) query = query.ilike("title", `%${q}%`);

  const [{ data: posts, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").order("position"),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const canCreate = user.isSuperadmin || can(role, "content.create");

  const restore = async (postId: string) => {
    "use server";
    await restoreContent(tenantSlug, postId);
  };
  const purge = async (postId: string) => {
    "use server";
    await purgeContent(tenantSlug, postId);
  };

  const buildHref = (patch: Partial<SearchParams>) => {
    const sp = new URLSearchParams();
    const merged = { status, q, category, page: "1", view: view ?? "", locale: locale ?? "", ...patch };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, String(v));
    });
    const qs = sp.toString();
    return `/${tenantSlug}/content${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contenido</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {count ?? 0} {count === 1 ? "entrada" : "entradas"}
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href={`/${tenantSlug}/content/new`}>
              <Plus className="size-4" />
              Nueva entrada
            </Link>
          </Button>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={buildHref({ status: tab.value, view: "" })}
              className={`rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors ${
                !isTrash && status === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
          <Link
            href={buildHref({ view: "trash", status: "" })}
            className={`rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors ${
              isTrash
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            Papelera
          </Link>
        </nav>

        <form action={`/${tenantSlug}/content`} className="relative ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por título…"
            className="w-56 pl-8"
          />
        </form>

        {tenant.locales.length > 1 && (
          <form action={`/${tenantSlug}/content`}>
            {status && <input type="hidden" name="status" value={status} />}
            <select
              name="locale"
              defaultValue={locale ?? ""}
              className="h-9 rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Todos los idiomas</option>
              {tenant.locales.map((code) => (
                <option key={code} value={code}>
                  {localeLabel(code)}
                </option>
              ))}
            </select>
          </form>
        )}

        {(categories ?? []).length > 0 && (
          <form action={`/${tenantSlug}/content`}>
            {status && <input type="hidden" name="status" value={status} />}
            <select
              name="category"
              defaultValue={category}
              className="h-9 rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Todas las categorías</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </form>
        )}
      </div>

      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {(posts ?? []).length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isTrash
              ? "La papelera está vacía."
              : q || status || category
                ? "Ningún contenido coincide con el filtro."
                : "Todavía no hay contenido."}
          </p>
        )}

        {(posts ?? []).map((post) => {
          const cat = post.category as unknown as { name: string } | null;

          if (isTrash) {
            return (
              <div key={post.id} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${tenantSlug}/content/${post.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cat?.name ? `${cat.name} · ` : ""}/{post.slug}
                  </p>
                </div>
                <TrashActions
                  postId={post.id}
                  title={post.title}
                  restoreAction={restore}
                  purgeAction={purge}
                />
              </div>
            );
          }

          return (
            <Link
              key={post.id}
              href={`/${tenantSlug}/content/${post.id}`}
              className="flex items-start gap-4 p-4 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{post.title}</span>
                  <StatusBadge status={post.status} />
                  {tenant.locales.length > 1 && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {post.locale}
                    </span>
                  )}
                </div>
                {post.excerpt && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {post.excerpt}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {cat?.name ? `${cat.name} · ` : ""}
                  /{post.slug}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(post.updated_at).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                })}
              </time>
            </Link>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={buildHref({ page: String(current - 1) })} className="hover:underline">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {current} de {totalPages}
          </span>
          {current < totalPages ? (
            <Link href={buildHref({ page: String(current + 1) })} className="hover:underline">
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
