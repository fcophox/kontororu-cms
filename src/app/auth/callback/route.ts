import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Destino del enlace de invitación y del magic link.
 *
 * Supabase manda un `code` de un solo uso que se canjea por sesión. Al
 * completarse, se marca la membresía como aceptada: hasta ese momento el
 * panel de Equipo la muestra como "invitación pendiente", que es información
 * real para quien administra el espacio.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid", url.origin));
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=invalid", url.origin));
  }

  // `accepted_at` lo escribe el service client: el propio usuario no tiene
  // permiso de UPDATE sobre tenant_users (eso es de OWNER/ADMIN), y no vamos
  // a abrir esa política sólo para esto.
  const admin = createServiceClient();
  await admin
    .from("tenant_users")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .is("accepted_at", null);

  // `next` viene de la URL: sólo se aceptan rutas internas. Sin esto,
  // ?next=https://evil.com convertiría el enlace de invitación —que llega
  // por email y parece de confianza— en un redirector abierto.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
