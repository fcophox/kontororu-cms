"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/roles";

const SCOPES = ["content:read", "media:read"] as const;

const CreateInput = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  scopes: z.array(z.enum(SCOPES)).min(1, "Elige al menos un permiso"),
});

export type ApiKeyState = {
  error?: string;
  /** Sólo se rellena justo después de crearla: NO se puede volver a obtener. */
  plainKey?: string;
};

export async function createApiKey(
  tenantSlug: string,
  _prev: ApiKeyState,
  formData: FormData,
): Promise<ApiKeyState> {
  const parsed = CreateInput.safeParse({
    name: formData.get("name"),
    scopes: formData.getAll("scopes"),
  });
  if (!parsed.success) {
    const issues = z.flattenError(parsed.error).fieldErrors;
    return { error: Object.values(issues).flat()[0] ?? "Datos no válidos" };
  }

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "apiKeys.manage")) {
    return { error: "No tienes permiso para gestionar API keys." };
  }

  const supabase = await createServerClient();

  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .is("revoked_at", null);

  if ((count ?? 0) >= tenant.limits.maxApiKeys) {
    return {
      error: `Tu plan permite ${tenant.limits.maxApiKeys} claves activas. Revoca alguna o amplía el plan.`,
    };
  }

  // La generación vive en Postgres: la clave en claro no se construye nunca
  // en la app, y el hash bcrypt se calcula en la misma transacción del INSERT.
  const { data, error } = await supabase.rpc("create_api_key", {
    p_tenant: tenant.id,
    p_name: parsed.data.name,
    p_scopes: parsed.data.scopes,
  });

  if (error || !data?.[0]) return { error: "No se pudo crear la clave." };

  await supabase.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: "api_key.create",
    entity: "api_keys",
    entity_id: data[0].id,
    metadata: { name: parsed.data.name, scopes: parsed.data.scopes },
  });

  revalidatePath(`/${tenantSlug}/settings/api-keys`);
  return { plainKey: data[0].plain_key };
}

export async function revokeApiKey(tenantSlug: string, keyId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "apiKeys.manage")) {
    throw new Error("No tienes permiso para gestionar API keys.");
  }

  const supabase = await createServerClient();

  // Se marca revocada, no se borra: `resolve_api_key` la rechaza igual, y
  // conservar la fila permite investigar después de un incidente qué clave
  // se usó, desde cuándo y quién la creó.
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);

  if (error) throw new Error("No se pudo revocar la clave.");

  await supabase.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: "api_key.revoke",
    entity: "api_keys",
    entity_id: keyId,
  });

  revalidatePath(`/${tenantSlug}/settings/api-keys`);
}
