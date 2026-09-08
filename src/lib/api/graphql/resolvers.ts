import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireScope, type ApiContext } from "@/lib/api/authenticate";
import {
  getMedia,
  getPost,
  listCategories,
  listMedia,
  listPosts,
  type QueryResult,
} from "@/lib/api/queries";

export type GraphQLContext = {
  ctx: ApiContext;
  db: SupabaseClient;
};

/**
 * Resolvers de GraphQL.
 *
 * Son una fachada delgada sobre `lib/api/queries`: las mismas funciones que
 * usan las rutas REST. Reimplementar aquí las consultas convertiría cada
 * corrección en dos, y tarde o temprano habría un bug que sólo aparece por un
 * transporte — un `!inner` olvidado, un `deleted_at` sin filtrar, un idioma
 * resuelto distinto.
 *
 * Lo único propio de esta capa es traducir códigos de error a `GraphQLError`
 * y decidir qué es `null` y qué es un fallo.
 */

/**
 * GraphQL responde 200 aunque falle, así que el código en `extensions` es lo
 * único que permite al cliente ramificar sin parsear mensajes.
 */
function fail(code: string, message: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}

/** Desenvuelve un `QueryResult`, convirtiendo el fallo en error de GraphQL. */
function unwrap<T>(result: QueryResult<T>): T {
  if (!result.ok) fail(result.code, result.message);
  return result.data;
}

function assertScope(ctx: ApiContext, scope: string): void {
  if (!requireScope(ctx, scope)) {
    fail("forbidden", `Esta clave no tiene el permiso "${scope}".`);
  }
}

const DateTime = new GraphQLScalarType({
  name: "DateTime",
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => value,
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
});

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: function parse(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value);
      case Kind.OBJECT:
        return Object.fromEntries(ast.fields.map((f) => [f.name.value, parse(f.value)]));
      case Kind.LIST:
        return ast.values.map(parse);
      case Kind.NULL:
        return null;
      default:
        return undefined;
    }
  },
});

/** `{ es: "slug" }` → `[{ locale, slug }]`, que es como lo expone el esquema. */
function toTranslationList(translations: Record<string, string>) {
  return Object.entries(translations).map(([locale, slug]) => ({ locale, slug }));
}

export const resolvers = {
  DateTime,
  JSON: JSONScalar,

  Query: {
    posts: async (
      _: unknown,
      args: {
        limit?: number | null;
        cursor?: string | null;
        locale?: string | null;
        fallback?: boolean | null;
        category?: string | null;
        tag?: string | null;
        q?: string | null;
      },
      { ctx, db }: GraphQLContext,
    ) => {
      assertScope(ctx, "content:read");
      const page = unwrap(await listPosts(db, ctx, args));
      return { nodes: page.items, pageInfo: page.pagination };
    },

    post: async (
      _: unknown,
      args: { slug: string; locale?: string | null; fallback?: boolean | null },
      { ctx, db }: GraphQLContext,
    ) => {
      assertScope(ctx, "content:read");

      const result = await getPost(db, ctx, args);

      // "No existe" es un valor legítimo en GraphQL: el tipo ya es anulable y
      // el cliente lo distingue sin mirar errores. El resto de códigos sí son
      // fallos y deben viajar como tales.
      if (!result.ok) {
        if (result.code === "not_found") return null;
        fail(result.code, result.message);
      }
      return result.data;
    },

    categories: async (
      _: unknown,
      args: { locale?: string | null; fallback?: boolean | null; kind?: string | null },
      { ctx, db }: GraphQLContext,
    ) => {
      assertScope(ctx, "content:read");
      return unwrap(await listCategories(db, ctx, args));
    },

    media: async (
      _: unknown,
      args: { limit?: number | null; cursor?: string | null; type?: string | null },
      { ctx, db }: GraphQLContext,
    ) => {
      assertScope(ctx, "media:read");
      const page = unwrap(await listMedia(db, ctx, args));
      return { nodes: page.items, pageInfo: page.pagination };
    },

    mediaAsset: async (_: unknown, args: { id: string }, { ctx, db }: GraphQLContext) => {
      assertScope(ctx, "media:read");

      const result = await getMedia(db, ctx, args.id);
      if (!result.ok) {
        if (result.code === "not_found") return null;
        fail(result.code, result.message);
      }
      return result.data;
    },
  },

  Post: {
    // La capa de consultas devuelve `{ en: "slug" }`; el esquema lo expone
    // como lista para que un cliente pueda pedir sólo `slug` sin recibir un
    // mapa de claves dinámicas, que GraphQL no sabe tipar.
    translations: (post: { translations: Record<string, string> }) =>
      toTranslationList(post.translations ?? {}),

    /**
     * El cuerpo sólo existe si la consulta lo trajo.
     *
     * `listPosts` no lo carga a propósito. Resolverlo aquí con una consulta
     * por entrada convertiría una portada de 100 elementos en 100 lecturas de
     * HTML completo sin que nadie lo hubiera pedido.
     */
    content: (post: { content?: unknown }) => post.content ?? null,
  },
};
