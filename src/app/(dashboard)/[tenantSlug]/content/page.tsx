import Image from "next/image";
import Link from "next/link";
import { Heart, Plus } from "lucide-react";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { signMediaBatch } from "@/lib/api/serializers";
import { can } from "@/lib/auth/guards";
import { StatusBadge } from "@/components/shared/status-badge";
import { LocaleBadges } from "@/components/shared/locale-badges";
import { Button } from "@/components/ui/button";
import { asContentStatus } from "@/lib/content/json";
import { localeLabel, asLocaleVersions } from "@/lib/content/locales";
import { getTenantAddon } from "@/lib/addons/queries";
import { ContentFilters } from "./content-filters";
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

  // El filtro de idioma dice "que TENGA esta versión", no "que esté escrito en
  // este idioma": el listado ya no enseña una fila por idioma.
  const localeFilter = locale && tenant.locales.includes(locale) ? locale : null;
  const supabase = await createServerClient();

  const current = Math.max(1, Number(page) || 1);
  const from = (current - 1) * PAGE_SIZE;

  /*
   * Dos fuentes distintas a propósito.
   *
   * El inventario sale de `content_index`, que colapsa cada grupo de
   * traducción a su original: sin eso, traducir un artículo lo duplicaría en
   * pantalla y con cuatro idiomas el listado sería ilegible.
   *
   * La papelera sigue sobre `posts`, fila a fila. Ahí lo que se decide es qué
   * restaurar y qué destruir, y esconder una traducción dentro de su original
   * escondería justo lo que hay que revisar.
   */
  let query = isTrash
    ? supabase
        .from("posts")
        .select(
          "id, slug, title, excerpt, status, published_at, updated_at, locale, category_id",
          { count: "exact" },
        )
        .not("deleted_at", "is", null)
    : supabase
        .from("content_index")
        .select(
          "id, slug, title, excerpt, status, published_at, updated_at, locale, category_id, versions, translation_group_id",
          { count: "exact" },
        );

  // RLS deja ver las filas de CUALQUIER tenant al que el usuario tenga acceso
  // (todos, si es SuperAdmin): no sabe qué `[tenantSlug]` está renderizando
  // esta página. Sin este filtro, un SuperAdmin o alguien con acceso a varios
  // espacios ve aquí la unión de todos ellos, no sólo el de la URL.
  query = query
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // El status viene de la query string: se valida contra el enum antes de
  // usarlo como filtro, en vez de confiar en que sea un valor legítimo.
  const statusFilter = status ? asContentStatus(status) : null;
  if (statusFilter) query = query.eq("status", statusFilter);
  if (category) query = query.eq("category_id", category);
  if (q) query = query.ilike("title", `%${q}%`);

  if (localeFilter) {
    // En la papelera se filtra por el idioma de la fila, que es lo que se ve
    // ahí. En el inventario, por los idiomas del grupo: pedir "Inglés" es
    // pedir los contenidos que tienen versión inglesa, no los escritos en
    // inglés — el original seguiría estando en español.
    query = isTrash
      ? query.eq("locale", localeFilter)
      : query.contains("locales", [localeFilter]);
  }

  const [{ data: posts, count, error: postsError }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").eq("tenant_id", tenant.id).order("position"),
  ]);

  // Una consulta fallida no puede parecerse a un espacio vacío. Antes se
  // ignoraba el error y la pantalla decía "Todavía no hay contenido": con
  // decenas de entradas detrás, es el peor mensaje posible.
  if (postsError) console.error("GET /[tenantSlug]/content", postsError);

  // La categoría se resuelve contra la lista que ya se pide para el filtro, en
  // vez de con un embed: PostgREST no infiere relaciones a través de la vista.
  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

  /*
   * Las dos fuentes se normalizan a una sola forma antes de pintar.
   *
   * Postgres declara nullable toda columna de una vista, y la papelera no trae
   * `versions`. Resolverlo aquí evita que cada línea del JSX arrastre su
   * propio `?? ""`.
   */
  const rows = (posts ?? []).flatMap((post) => {
    const row = post as Record<string, unknown>;
    if (typeof row.id !== "string") return [];
    return [
      {
        id: row.id,
        slug: String(row.slug ?? ""),
        title: String(row.title ?? ""),
        excerpt: typeof row.excerpt === "string" ? row.excerpt : null,
        status: String(row.status ?? "DRAFT"),
        locale: String(row.locale ?? ""),
        updatedAt: String(row.updated_at ?? ""),
        categoryName:
          typeof row.category_id === "string"
            ? (categoryNames.get(row.category_id) ?? null)
            : null,
        versions: asLocaleVersions(row.versions),
        translationGroupId:
          typeof row.translation_group_id === "string" ? row.translation_group_id : null,
      },
    ];
  });

  /*
   * Las portadas de las filas visibles.
   *
   * No salen del `select` principal: `content_index` es una vista y PostgREST
   * no infiere relaciones a través de ella, así que el embed sólo es posible
   * sobre `posts`. Se pide por los ids ya paginados —veinte como mucho— y se
   * firma en un solo lote, no una URL por fila.
   */
  const coverUrls = new Map<string, string>();

  if (rows.length > 0) {
    const { data: covers } = await supabase
      .from("posts")
      .select("id, cover:media(id, bucket, path, provider, alt_text, width, height)")
      .in("id", rows.map((r) => r.id))
      .not("cover_media_id", "is", null);

    const withCover = (covers ?? []).flatMap((row) => {
      const cover = row.cover as Parameters<typeof signMediaBatch>[1][number];
      return cover ? [{ postId: row.id, cover }] : [];
    });

    if (withCover.length > 0) {
      const signed = await signMediaBatch(
        createServiceClient(),
        withCover.map((item) => item.cover),
      );
      for (const { postId, cover } of withCover) {
        const url = signed.get(cover.path);
        // Sin URL firmada no se pinta nada: un hueco roto es peor que la
        // fila sin miniatura, que es como se ven los contenidos sin portada.
        if (url) coverUrls.set(postId, url);
      }
    }
  }

  /*
   * Las reacciones de las filas que se van a pintar, y sólo ésas.
   *
   * No se usa `content_reaction_summary`, que agrega TODO el espacio: en la
   * página 1 de un cliente con mil contenidos se traería mil grupos para
   * enseñar veinte números. Filtrando por los grupos visibles, la consulta
   * crece con la página, no con el histórico.
   *
   * La papelera se queda fuera: ahí lo que se decide es qué restaurar, y un
   * contador de aplausos no ayuda a decidirlo.
   */
  const reactionsAddon = isTrash ? null : await getTenantAddon(tenant.id, "reactions");
  const reactionTotals = new Map<string, number>();

  if (reactionsAddon?.isEnabled && rows.length > 0) {
    const { data: reactions } = await supabase
      .from("content_reactions")
      .select("translation_group_id, total")
      .in(
        "translation_group_id",
        rows.map((r) => r.translationGroupId).filter((id): id is string => Boolean(id)),
      );

    // Se suman los gestos: en el listado cabe un número, y "43" dice lo mismo
    // que "12 me gusta y 31 aplausos" para decidir qué contenido abrir. El
    // desglose está en la pantalla del complemento.
    for (const row of reactions ?? []) {
      reactionTotals.set(
        row.translation_group_id,
        (reactionTotals.get(row.translation_group_id) ?? 0) + Number(row.total),
      );
    }
  }

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
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
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

      <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <nav className="flex flex-wrap gap-1">
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

        <ContentFilters
          tenantSlug={tenantSlug}
          current={{ status, q, category, locale: localeFilter ?? "", view: view ?? "" }}
          locales={tenant.locales}
          categories={categories ?? []}
        />
      </div>

      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {postsError && (
          <p className="p-8 text-center text-sm text-destructive">
            No se pudo cargar el contenido. Vuelve a intentarlo en un momento.
          </p>
        )}

        {!postsError && rows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isTrash
              ? "La papelera está vacía."
              : q || status || category
                ? "Ningún contenido coincide con el filtro."
                : "Todavía no hay contenido."}
          </p>
        )}

        {rows.map((post) => {
          const { categoryName } = post;
          // Cero no se pinta: una columna de ceros ocupa sitio y no dice nada
          // que la ausencia del icono no diga ya.
          const reactions = post.translationGroupId
            ? (reactionTotals.get(post.translationGroupId) ?? 0)
            : 0;
          const coverUrl = coverUrls.get(post.id) ?? null;

          if (isTrash) {
            return (
              <div key={post.id} className="flex items-center gap-4 p-4">
                {coverUrl && (
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-[var(--radius)] border bg-muted">
                    <Image
                      src={coverUrl}
                      alt=""
                      fill
                      unoptimized /* la URL firmada caduca: optimizarla la cachearía rota */
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${tenantSlug}/content/${post.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {categoryName ? `${categoryName} · ` : ""}
                    {localeLabel(post.locale)} · /{post.slug}
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
              {/* Sin portada no se reserva el hueco: una columna de recuadros
                  vacíos pesa más en la lectura que la desalineación. */}
              {coverUrl && (
                <div className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius)] border bg-muted">
                  <Image
                    src={coverUrl}
                    alt=""
                    fill
                    unoptimized /* la URL firmada caduca: optimizarla la cachearía rota */
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{post.title}</span>
                  <StatusBadge status={post.status} />
                  <LocaleBadges versions={post.versions} originalLocale={post.locale} />
                </div>
                {post.excerpt && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {post.excerpt}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {categoryName ? `${categoryName} · ` : ""}
                  /{post.slug}
                </p>
              </div>
              {reactions > 0 && (
                <span
                  className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title={`${reactions} ${reactions === 1 ? "reacción" : "reacciones"}`}
                >
                  <Heart className="size-3.5" />
                  <span className="tabular-nums">{reactions}</span>
                </span>
              )}
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(post.updatedAt).toLocaleDateString("es-ES", {
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
