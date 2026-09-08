import { createYoga, createSchema, createGraphQLError } from "graphql-yoga";
import { authenticateRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, corsPreflight } from "@/lib/api/response";
import {
  consumeForAnonymous,
  consumeForKey,
  rateLimitHeaders,
  tooManyRequests,
} from "@/lib/api/rate-limit";
import { typeDefs } from "@/lib/api/graphql/schema";
import { resolvers, type GraphQLContext } from "@/lib/api/graphql/resolvers";
import { estimateCost, QueryTooComplexError } from "@/lib/api/graphql/cost";
import { reportError } from "@/lib/observability/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = createSchema({ typeDefs, resolvers });

/*
 * El contexto va como *server context*: es lo que se le pasa a
 * `handleRequest`, y es donde caben la clave ya resuelta y el cliente de base
 * de datos. Declararlo como contexto de usuario obligaría a construirlo dentro
 * de Yoga, y para entonces la autenticación y el cupo ya han tenido que
 * decidirse — un 401 debe salir sin llegar a ejecutar nada.
 */
const yoga = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/v1/graphql",
  // El manejo de errores y la respuesta la envuelve el handler de abajo.
  fetchAPI: { Response },
  // GraphiQL sólo en desarrollo: en producción es superficie sin uso.
  graphiql: process.env.NODE_ENV !== "production",
  /*
   * `maskedErrors` deja pasar los errores con código propio y esconde el
   * resto. Sin esto, un fallo de Postgres viajaría con su mensaje al cliente
   * —nombres de tablas, columnas, constraints— que es justo lo que un
   * atacante usa para mapear el esquema.
   */
  maskedErrors: {
    maskError: (error) => {
      const known = (error as { extensions?: { code?: string } })?.extensions?.code;
      if (known) return error as Error;
      reportError(error, { scope: "api.graphql" });
      return createGraphQLError("Error interno.", {
        extensions: { code: "server_error" },
      });
    },
  },
});

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Endpoint GraphQL.
 *
 * Comparte autenticación, aislamiento y cupo con REST — es la misma API con
 * otra forma de pedirla. Lo único propio es el **coste**: una consulta puede
 * hacer el trabajo de cien peticiones REST, así que descuenta en proporción.
 */
export async function POST(request: Request) {
  // Se lee el cuerpo aquí para poder estimar el coste ANTES de ejecutar nada;
  // luego se reconstruye la petición para Yoga, que necesita leerlo también.
  const body = await request.text();

  const ctx = await authenticateRequest(request);
  if (!ctx) {
    const anonymous = await consumeForAnonymous(request);
    if (!anonymous.allowed) return tooManyRequests(anonymous);
    return apiError("unauthorized", "API key inválida o revocada.");
  }

  let cost: number;
  try {
    const parsed = JSON.parse(body) as { query?: string };
    cost = estimateCost(parsed.query ?? "");
  } catch (error) {
    if (error instanceof QueryTooComplexError) {
      return apiError("bad_request", error.message);
    }
    return apiError("bad_request", "El cuerpo debe ser JSON con una consulta.");
  }

  const verdict = await consumeForKey(ctx.apiKeyId, ctx.plan, cost);
  if (!verdict.allowed) return tooManyRequests(verdict);

  const response = await yoga.handleRequest(
    new Request(request.url, { method: "POST", headers: request.headers, body }),
    { ctx, db: createServiceClient() },
  );

  // Las cabeceras de cupo también aquí: quien consume GraphQL necesita ver
  // cuánto le queda tanto como quien consume REST.
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(rateLimitHeaders(verdict))) {
    headers.set(key, value);
  }
  headers.set("X-GraphQL-Cost", String(cost));

  return new Response(response.body, { status: response.status, headers });
}

/**
 * GET sirve GraphiQL en desarrollo y nada en producción.
 *
 * Las consultas por GET quedan fuera a propósito: acaban en logs de acceso y
 * en el historial del navegador, y aquí la cabecera `Authorization` lleva una
 * clave que da acceso a todo el contenido del cliente.
 */
export async function GET(request: Request) {
  const wantsToExecute = new URL(request.url).searchParams.has("query");

  if (process.env.NODE_ENV === "production" || wantsToExecute) {
    return apiError("bad_request", "GraphQL sólo acepta POST.");
  }

  // Sólo llega aquí la petición del IDE, que es HTML y no ejecuta nada: por
  // eso puede servirse sin contexto. Sus consultas salen luego por POST y
  // pasan por la misma puerta que cualquier otro cliente.
  return yoga.handleRequest(request, {} as GraphQLContext);
}
