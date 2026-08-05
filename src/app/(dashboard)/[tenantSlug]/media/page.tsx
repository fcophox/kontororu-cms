import { getTenantContext } from "@/lib/auth/tenant-context";
import { createServerClient } from "@/lib/supabase/server";
import { signLocations } from "@/lib/storage/factory";
import { MediaGrid } from "./media-grid";
import { updateAltText, deleteMedia } from "./actions";

export const metadata = { title: "Medios" };

const PAGE_SIZE = 48;
const SIGNED_URL_TTL = 60 * 60; // 1 h

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantSlug } = await params;
  const { page = "1" } = await searchParams;

  const { tenant } = await getTenantContext(tenantSlug);
  const supabase = await createServerClient();

  const current = Math.max(1, Number(page) || 1);
  const from = (current - 1) * PAGE_SIZE;

  const { data: media, count, error } = await supabase
    .from("media")
    .select("id, bucket, path, provider, mime_type, size_bytes, width, height, alt_text, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(`No se pudieron cargar los medios: ${error.message}`);

  // El bucket es privado: se firma cada objeto. Las URLs caducan en 1 h, así
  // que no sirven para incrustar en la web del cliente — para eso está la API,
  // que las firma en cada lectura. Aquí sólo alimentan las miniaturas.
  // Se firman todas de golpe, agrupadas por proveedor: durante una migración
  // a S3 la misma pantalla mezcla archivos de los dos sitios.
  const signed = await signLocations(
    supabase,
    (media ?? []).map((m) => ({ provider: m.provider, bucket: m.bucket, path: m.path })),
    SIGNED_URL_TTL,
  );

  const items = (media ?? []).map((item) => ({
    id: item.id,
    mimeType: item.mime_type,
    sizeBytes: item.size_bytes,
    width: item.width,
    height: item.height,
    altText: item.alt_text ?? "",
    createdAt: item.created_at,
    url: signed.get(item.path) ?? null,
  }));

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const saveAlt = async (mediaId: string, alt: string) => {
    "use server";
    await updateAltText(tenantSlug, mediaId, alt);
  };
  const remove = async (mediaId: string) => {
    "use server";
    await deleteMedia(tenantSlug, mediaId);
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Medios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count ?? 0} {count === 1 ? "archivo" : "archivos"} ·{" "}
          {formatBytes(items.reduce((sum, i) => sum + i.sizeBytes, 0))} en esta página
        </p>
      </header>

      <MediaGrid
        tenantId={tenant.id}
        items={items}
        page={current}
        totalPages={totalPages}
        basePath={`/${tenantSlug}/media`}
        saveAltAction={saveAlt}
        deleteAction={remove}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
