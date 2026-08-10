import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { WebhookList } from "./webhook-list";
import {
  createWebhook,
  toggleWebhook,
  deleteWebhook,
  retryDelivery,
  type WebhookState,
} from "./actions";

export const metadata = { title: "Webhooks" };

const DELIVERY_LIMIT = 20;

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const { tenant } = await requirePermission(tenantSlug, "webhooks.manage");

  const supabase = await createServerClient();

  const [{ data: hooks, error: hooksError }, { data: deliveries, error: deliveriesError }] =
    await Promise.all([
      supabase
        .from("webhooks")
        .select("id, name, url, secret, events, is_active")
        .eq("tenant_id", tenant.id)
        .order("created_at"),
      supabase
        .from("webhook_deliveries")
        .select("id, event, attempt, status_code, error, delivered_at, created_at")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(DELIVERY_LIMIT),
    ]);

  if (hooksError) throw new Error(`No se pudieron cargar los webhooks: ${hooksError.message}`);
  if (deliveriesError) {
    throw new Error(`No se pudieron cargar las entregas: ${deliveriesError.message}`);
  }

  const create = async (prev: WebhookState, formData: FormData) => {
    "use server";
    return createWebhook(tenantSlug, prev, formData);
  };
  const toggle = async (id: string, isActive: boolean) => {
    "use server";
    await toggleWebhook(tenantSlug, id, isActive);
  };
  const remove = async (id: string) => {
    "use server";
    await deleteWebhook(tenantSlug, id);
  };
  const retry = async (deliveryId: string) => {
    "use server";
    await retryDelivery(tenantSlug, deliveryId);
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Avisamos a tu web cuando cambia el contenido, para que regenere sus
          páginas sin esperar a la siguiente compilación.
        </p>
      </header>

      <WebhookList
        webhooks={(hooks ?? []).map((h) => ({
          id: h.id,
          name: h.name,
          url: h.url,
          secret: h.secret,
          events: h.events as string[],
          isActive: h.is_active,
        }))}
        deliveries={(deliveries ?? []).map((d) => ({
          id: d.id,
          event: d.event as string,
          attempt: d.attempt,
          statusCode: d.status_code,
          error: d.error,
          deliveredAt: d.delivered_at,
          createdAt: d.created_at,
        }))}
        createAction={create}
        toggleAction={toggle}
        deleteAction={remove}
        retryAction={retry}
      />
    </div>
  );
}
