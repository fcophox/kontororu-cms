import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/*
 * `Location` relativa a propósito. `url.origin` sale de `request.url`, que
 * detrás del proxy de Render es la dirección interna del contenedor
 * (`localhost:10000`) y no el dominio público: el navegador acababa ahí. Una
 * ruta relativa la resuelve contra el dominio por el que entró la petición.
 * Los destinos ya están acotados a rutas internas más abajo.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

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
    return redirectTo("/login?error=invalid");
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return redirectTo("/login?error=invalid");
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

  return redirectTo(safeNext);
}
