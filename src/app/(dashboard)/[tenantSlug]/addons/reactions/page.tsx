import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Heart } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantAddon } from "@/lib/addons/queries";
import { reactionLabel } from "@/lib/addons/reactions";
import { ReactionRanking, type RankingRow } from "./reaction-ranking";
import { ReactionSnippet } from "./reaction-snippet";
import { resetReactions } from "./actions";

export const metadata = { title: "Reacciones" };

/** Cuántos contenidos entran en el ranking. Es una pantalla de lectura, no un inventario. */
const RANKING_SIZE = 50;

export default async function ReactionsAddonPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requirePermission(tenantSlug, "addons.manage");

  const addon = await getTenantAddon(tenant.id, "reactions");
  if (!addon?.isEnabled) notFound();

  const supabase = await createServerClient();

  /*
   * Dos consultas y no un embed.
   *
   * `content_reactions` cuelga de `translation_group_id`, que NO es único en
   * `posts` —lo comparten todas las traducciones—, así que no hay clave ajena
   * y PostgREST no puede inferir la relación. Se traen los contadores, y luego
   * los títulos de los grupos que han salido.
   */
  const { data: rows, error } = await supabase
    .from("content_reactions")
    .select("translation_group_id, reaction_key, total")
    .eq("tenant_id", tenant.id)
    .order("total", { ascending: false })
    // Holgado sobre RANKING_SIZE: son varias filas por contenido, una por gesto.
    .limit(RANKING_SIZE * 8);

  if (error) throw new Error(`No se pudieron cargar las reacciones: ${error.message}`);

  // Los gestos se agrupan por contenido, conservando el desglose: saber que
  // un artículo tiene 40 reacciones dice menos que saber que son 12 me gusta
  // y 28 aplausos.
  const byGroup = new Map<string, { total: number; gestures: Record<string, number> }>();
  for (const row of rows ?? []) {
    const entry = byGroup.get(row.translation_group_id) ?? { total: 0, gestures: {} };
    entry.total += Number(row.total);
    entry.gestures[row.reaction_key] = Number(row.total);
    byGroup.set(row.translation_group_id, entry);
  }

  const groupIds = [...byGroup.keys()];

  /*
   * Los títulos salen de `content_index` y no de `posts`: la vista ya colapsa
   * cada grupo a su original, así que devuelve una fila por contenido. Sobre
   * `posts` habría que elegir a mano cuál de las traducciones da el título, y
   * un artículo traducido a cuatro idiomas aparecería cuatro veces con el
   * mismo número al lado.
   */
  const { data: contents } = groupIds.length
    ? await supabase
        .from("content_index")
        .select("id, title, slug, status, translation_group_id")
        .in("translation_group_id", groupIds)
    : { data: [] };

  const ranking: RankingRow[] = (contents ?? [])
    .flatMap((c) => {
      const entry = c.translation_group_id ? byGroup.get(c.translation_group_id) : undefined;
      if (!entry || !c.id || !c.translation_group_id) return [];
      return [
        {
          postId: c.id,
          translationGroupId: c.translation_group_id,
          title: c.title ?? "(sin título)",
          slug: c.slug ?? "",
          status: c.status ?? "DRAFT",
          total: entry.total,
          gestures: Object.entries(entry.gestures)
            .map(([key, value]) => ({ key, label: reactionLabel(key), total: value }))
            .sort((a, b) => b.total - a.total),
        },
      ];
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, RANKING_SIZE);

  const grandTotal = ranking.reduce((acc, r) => acc + r.total, 0);

  const reset = async (translationGroupId: string) => {
    "use server";
    await resetReactions(tenantSlug, translationGroupId);
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

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reacciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuántas personas han pulsado el gesto de tu web en cada contenido. El
          número es del contenido completo: si un artículo está traducido, las
          reacciones de todos los idiomas suman al mismo contador.
        </p>
      </header>

      {ranking.length > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius)] border bg-card p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{grandTotal}</p>
            <p className="text-xs text-muted-foreground">
              reacciones en {ranking.length}{" "}
              {ranking.length === 1 ? "contenido" : "contenidos"}
            </p>
          </div>
        </div>
      )}

      <ReactionRanking
        basePath={`/${tenantSlug}/content`}
        rows={ranking}
        resetAction={reset}
      />

      <ReactionSnippet tenantSlug={tenantSlug} />
    </div>
  );
}
