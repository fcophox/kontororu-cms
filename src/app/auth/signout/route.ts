import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Cierre de sesión.
 *
 * Es un POST, no un GET: con un enlace, cualquier `<img src="/auth/signout">`
 * en contenido de un tenant desconectaría a quien lo viera. Un POST desde un
 * formulario no se dispara por navegación.
 */
export async function POST() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  /*
   * `Location` relativa a propósito. Construirla con `request.url` mandaba a
   * `localhost:10000` en producción: detrás del proxy de Render esa es la
   * dirección interna del contenedor, no el dominio público. Una ruta relativa
   * la resuelve el navegador contra el dominio por el que entró, así que
   * funciona igual en local, en preview y en producción sin adivinar el host.
   */
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
