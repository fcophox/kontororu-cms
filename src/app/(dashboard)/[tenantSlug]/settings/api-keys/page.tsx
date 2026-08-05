import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { ApiKeyList } from "./api-key-list";
import { createApiKey, revokeApiKey, type ApiKeyState } from "./actions";

export const metadata = { title: "API Keys" };

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // `requirePermission` incluye el bypass de SuperAdmin: repetir
  // `!user.isSuperadmin && …` en cada página es una comprobación que
  // basta olvidar una vez para dejar a Rukma Studio sin soporte.
  const { tenant } = await requirePermission(tenantSlug, "apiKeys.manage");

  const supabase = await createServerClient();

  // Se lee de la VISTA, no de la tabla: `api_keys_public` omite `key_hash`.
  // Aunque el hash sea bcrypt, no hay razón para que salga del servidor.
  const { data: keys, error } = await supabase
    .from("api_keys_public")
    .select("id, name, key_prefix, scopes, last_used_at, created_at, revoked_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar las claves: ${error.message}`);

  const rows = (keys ?? []).map((k) => ({
    id: k.id as string,
    name: k.name as string,
    keyPrefix: k.key_prefix as string,
    scopes: (k.scopes ?? []) as string[],
    lastUsedAt: k.last_used_at as string | null,
    createdAt: k.created_at as string,
    revokedAt: k.revoked_at as string | null,
  }));

  const create = async (prev: ApiKeyState, formData: FormData) => {
    "use server";
    return createApiKey(tenantSlug, prev, formData);
  };
  const revoke = async (keyId: string) => {
    "use server";
    await revokeApiKey(tenantSlug, keyId);
  };

  const activeCount = rows.filter((k) => !k.revokedAt).length;

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeCount} de {tenant.limits.maxApiKeys} claves activas. Cada clave
          da acceso de lectura al contenido publicado de este espacio.
        </p>
      </header>

      <ApiKeyList
        keys={rows}
        atLimit={activeCount >= tenant.limits.maxApiKeys}
        createAction={create}
        revokeAction={revoke}
      />
    </div>
  );
}
