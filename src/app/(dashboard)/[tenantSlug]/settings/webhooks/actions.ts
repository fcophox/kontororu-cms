"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";
import { WEBHOOK_EVENTS } from "@/lib/content/webhook-events";
import { rejectOutboundUrl, REJECTION_MESSAGES } from "@/lib/security/ssrf";

const WebhookInput = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  url: z
    .string()
    .trim()
    .url("URL no válida")
    .refine((u) => u.startsWith("https://"), "El endpoint debe usar HTTPS"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Elige al menos un evento"),
});

export type WebhookState = { error?: string; ok?: string };

export async function createWebhook(
  tenantSlug: string,
  _prev: WebhookState,
  formData: FormData,
): Promise<WebhookState> {
  const parsed = WebhookInput.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    events: formData.getAll("events"),
  });
  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }

  const rejection = rejectOutboundUrl(parsed.data.url);
  if (rejection) return { error: REJECTION_MESSAGES[rejection] };

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "webhooks.manage")) {
    return { error: "No tienes permiso para gestionar webhooks." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("webhooks").insert({
    tenant_id: tenant.id,
    name: parsed.data.name,
    url: parsed.data.url,
    events: parsed.data.events,
  });

  if (error) return { error: "No se pudo crear el webhook." };

  revalidatePath(`/${tenantSlug}/settings/webhooks`);
  return { ok: "Webhook creado." };
}

export async function toggleWebhook(tenantSlug: string, webhookId: string, isActive: boolean) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "webhooks.manage")) {
    throw new Error("No tienes permiso para gestionar webhooks.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("webhooks")
    .update({ is_active: isActive })
    .eq("id", webhookId);

  if (error) throw new Error("No se pudo cambiar el estado del webhook.");
  revalidatePath(`/${tenantSlug}/settings/webhooks`);
}

export async function deleteWebhook(tenantSlug: string, webhookId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "webhooks.manage")) {
    throw new Error("No tienes permiso para gestionar webhooks.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", webhookId);
  if (error) throw new Error("No se pudo eliminar el webhook.");

  revalidatePath(`/${tenantSlug}/settings/webhooks`);
}

/**
 * Reintento manual: devuelve la entrega a la cola con efecto inmediato.
 *
 * No se reenvía desde aquí — se pone `next_attempt_at` en el pasado y el
 * worker la recoge. Así el reintento pasa por el mismo camino que el
 * automático, con su firma y su registro, en vez de por una segunda ruta
 * que podría divergir.
 */
export async function retryDelivery(tenantSlug: string, deliveryId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "webhooks.manage")) {
    throw new Error("No tienes permiso para gestionar webhooks.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("webhook_deliveries")
    .update({ attempt: 0, next_attempt_at: new Date().toISOString(), error: null })
    .eq("id", deliveryId);

  if (error) throw new Error("No se pudo reencolar la entrega.");
  revalidatePath(`/${tenantSlug}/settings/webhooks`);
}
