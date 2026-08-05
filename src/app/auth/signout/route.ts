import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Cierre de sesión.
 *
 * Es un POST, no un GET: con un enlace, cualquier `<img src="/auth/signout">`
 * en contenido de un tenant desconectaría a quien lo viera. Un POST desde un
 * formulario no se dispara por navegación.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
