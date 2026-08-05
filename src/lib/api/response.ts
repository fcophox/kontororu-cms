import { NextResponse } from "next/server";

/**
 * Formato de respuesta de la API headless.
 *
 * Un único sitio donde se decide la forma del JSON y las cabeceras: si cada
 * endpoint la construye a mano, el cliente acaba escribiendo un `if` distinto
 * por ruta.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "server_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  bad_request: 400,
  server_error: 500,
};

export function apiError(code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

/**
 * Ventana de caché de la API pública.
 *
 * 60 s en el CDN y 10 min sirviendo contenido viejo mientras revalida. No hace
 * falta más: el webhook avisa a la web del cliente en cuanto se publica, así
 * que la caché sólo cubre el hueco entre la publicación y el aviso.
 */
export const CACHE_SECONDS = 60;
export const STALE_SECONDS = 600;

export function apiJson<T>(body: T, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      ...extraHeaders,
    },
  });
}

/**
 * Preflight de CORS.
 *
 * `next.config.ts` pone las cabeceras en todas las respuestas de /api/v1, pero
 * el navegador manda un OPTIONS antes de cualquier petición con cabecera
 * `Authorization` — y sin handler, Next responde 405 y la petición real nunca
 * llega a salir.
 */
export function corsPreflight() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Lee un entero de la query string, acotado. */
export function readLimit(url: URL, fallback = 20, max = 100): number {
  const raw = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}

/**
 * Resuelve el idioma de una petición.
 *
 * Sin `?locale=` se sirve el principal del cliente, nunca "todos": un consumidor
 * que ya existe no debe empezar a ver cada artículo duplicado el día que su
 * cliente active un segundo idioma.
 *
 * Un idioma no activado devuelve error en vez de una lista vacía — un 200 con
 * cero resultados se confunde con "aún no hay contenido" y cuesta horas.
 */
export function readLocale(
  url: URL,
  ctx: { defaultLocale: string; locales: string[] },
): { locale: string } | { error: string } {
  const requested = url.searchParams.get("locale");
  if (!requested) return { locale: ctx.defaultLocale };

  if (!ctx.locales.includes(requested)) {
    return {
      error: `El idioma "${requested}" no está activado. Disponibles: ${ctx.locales.join(", ")}.`,
    };
  }
  return { locale: requested };
}
