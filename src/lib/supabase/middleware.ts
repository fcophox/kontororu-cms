import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refresca la sesión en cada request y decide el acceso a las áreas privadas.
 *
 * Dos reglas que no son negociables aquí:
 *
 * 1. Se usa `getUser()`, nunca `getSession()`. `getSession()` lee la cookie sin
 *    validarla contra el servidor de auth: una cookie manipulada pasaría el
 *    filtro. En el borde de autorización sólo vale un token verificado.
 *
 * 2. Se devuelve SIEMPRE el mismo objeto `response` que recibió las cookies
 *    de Supabase. Construir un `NextResponse` nuevo al final descarta el token
 *    refrescado y provoca cierres de sesión aleatorios al expirar el access token.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/pricing") ||
    // La API headless se autentica con API Key, no con cookie de sesión.
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/internal");

  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return response;
}
