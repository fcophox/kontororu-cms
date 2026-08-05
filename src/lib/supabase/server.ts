import { cookies } from "next/headers";
import {
  createServerClient as createSSRClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente ligado a la sesión del usuario. TODA consulta pasa por RLS:
 * el aislamiento entre tenants no depende de que la app filtre bien.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}

/**
 * Cliente con service role. Bypassea RLS — úsalo SÓLO en:
 *   · la API headless, tras validar la API Key y con tenant_id explícito
 *   · el worker de webhooks
 *   · tareas de plataforma del SuperAdmin
 * Nunca lo importes desde un componente cliente.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Arquitectura híbrida: tenants Enterprise con base de datos dedicada.
 * La service key se resuelve desde Supabase Vault, nunca desde la fila.
 */
export async function createTenantClient(tenant: {
  db_mode: "SHARED" | "DEDICATED";
  external_db_url: string | null;
  external_db_key_ref: string | null;
}) {
  if (tenant.db_mode === "SHARED") return createServiceClient();

  // FASE 3 — no implementado todavía.
  //
  // Falta la pieza sensible: una función `read_vault_secret` que lea la
  // service key del tenant desde Supabase Vault, ejecutable SÓLO por
  // service_role. Hasta que exista y esté cubierta por tests, este camino
  // falla en voz alta en lugar de fingir que funciona: un tenant marcado
  // como DEDICATED por error no debe acabar leyendo la base compartida.
  throw new Error(
    "Tenants con base de datos dedicada (db_mode = 'DEDICATED') aún no están soportados. " +
      "Ver docs/ARCHITECTURE.md §2.3 — Fase 3.",
  );
}
