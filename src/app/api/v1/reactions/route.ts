import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/response";
import {
  consumeForReactions,
  rateLimitHeaders,
  tooManyRequests,
} from "@/lib/api/rate-limit";
import { ReactionInput, asTotals } from "@/lib/addons/reactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reacciones — el único endpoint público SIN API Key.
 *
 * El resto de /api/v1 lo llama el servidor de la web del cliente, que puede
 * guardar una clave. Este lo llama el NAVEGADOR de quien está leyendo el
 * artículo, y una clave en el bundle la lee cualquiera con F12: sería una
 * credencial pública con nombre de secreta. Mejor no tenerla.
 *
 * Lo que sustituye a la clave:
 *
 *  - El cupo por origen (60/min), que es lo que frena a un script.
 *  - `register_reaction`, que sólo cuenta si el contenido está PUBLICADO y el
 *    complemento activo. Con el slug de un borrador no se escribe nada.
 *  - Que no haya nada que robar: el peor abuso posible es inflar un contador
 *    de aplausos, no leer datos ajenos.
 *
 * El "una vez por persona" NO se resuelve aquí. Vive en el navegador de quien
 * lee (localStorage), porque deduplicar en el servidor exigiría guardar algo
 * que identifique al visitante —una huella, una cookie, su IP— y eso es un
 * dato personal de un tercero a cambio de un número que no lo justifica.
 */

/**
 * Preflight propio.
 *
 * Las cabeceras de CORS ya las pone `next.config.ts` en todo /api/v1, pero
 * sin handler de OPTIONS Next responde 405 y la petición real nunca sale.
 * No se reutiliza `corsPreflight()` porque aquel sólo anuncia GET, y aquí lo
 * que importa es el POST.
 */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * POST /api/v1/reactions
 *   { "tenant": "mi-espacio", "slug": "mi-articulo", "reaction": "like" }
 *
 * Devuelve el total del gesto YA incrementado, para que la web pueda pintar
 * el número nuevo sin una segunda petición.
 */
export async function POST(req: Request) {
  const verdict = await consumeForReactions(req);
  if (!verdict.allowed) return tooManyRequests(verdict);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(apiError("bad_request", "El cuerpo debe ser JSON."));
  }

  const parsed = ReactionInput.safeParse(body);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return noStore(
      apiError(
        "bad_request",
        Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? "Datos no válidos",
      ),
    );
  }

  const { tenant, slug, reaction, locale } = parsed.data;

  const db = createServiceClient();

  // Una sola llamada: resolver espacio, validar contenido y complemento, e
  // incrementar de forma atómica. El incremento en dos pasos —leer el total y
  // escribir total+1— pierde reacciones en cuanto dos personas pulsan a la vez:
  // ambas leen el mismo número y ambas escriben el mismo+1.
  const { data, error } = await db.rpc("register_reaction", {
    p_tenant_slug: tenant,
    p_slug: slug,
    p_reaction: reaction,
    // Se omite, no se manda null: el argumento tiene DEFAULT null en la
    // función, y omitirlo es lo que activa ese default.
    p_locale: locale ?? undefined,
  });

  if (error) {
    console.error("POST /api/v1/reactions", error);
    return noStore(apiError("server_error", "No se pudo registrar la reacción."));
  }

  /*
   * NULL cubre tres casos —espacio inexistente, contenido no publicado y
   * complemento apagado— y los tres responden lo mismo a propósito: que exista
   * un borrador con ese slug no es información pública, y este endpoint lo
   * puede llamar cualquiera.
   */
  if (data === null) {
    return noStore(
      apiError("not_found", "No hay contenido publicado que pueda recibir esa reacción."),
    );
  }

  return NextResponse.json(
    { data: { slug, reaction, total: Number(data) } },
    {
      headers: {
        ...rateLimitHeaders(verdict),
        // Un contador que sube con cada clic no se cachea: servir el número de
        // hace un minuto haría parecer que el clic no se registró.
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * GET /api/v1/reactions?tenant=mi-espacio&slug=mi-articulo
 *
 * Los contadores actuales, `gesto -> número`. Es lo que pinta la web al cargar
 * el artículo, antes de que nadie pulse nada.
 *
 * Un contenido sin reacciones devuelve `{}` y no un 404: cero aplausos es una
 * respuesta legítima, y obligar a la web a distinguir "no existe" de "aún
 * nadie" para pintar un cero es trabajo que no aporta.
 */
export async function GET(req: Request) {
  const verdict = await consumeForReactions(req);
  if (!verdict.allowed) return tooManyRequests(verdict);

  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant");
  const slug = url.searchParams.get("slug");
  const locale = url.searchParams.get("locale");

  if (!tenant || !slug) {
    return noStore(apiError("bad_request", "Faltan los parámetros `tenant` y `slug`."));
  }

  const db = createServiceClient();

  const { data, error } = await db.rpc("content_reaction_totals", {
    p_tenant_slug: tenant,
    p_slug: slug,
    p_locale: locale ?? undefined,
  });

  if (error) {
    console.error("GET /api/v1/reactions", error);
    return noStore(apiError("server_error", "No se pudieron leer las reacciones."));
  }

  return NextResponse.json(
    { data: { slug, totals: asTotals(data) } },
    {
      headers: {
        ...rateLimitHeaders(verdict),
        // 10 s de CDN: suficiente para absorber una portada que pide los
        // números de veinte artículos, poco para que se vean congelados.
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60",
      },
    },
  );
}

/** Un error de contador nunca se cachea: el siguiente intento debe llegar. */
function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
