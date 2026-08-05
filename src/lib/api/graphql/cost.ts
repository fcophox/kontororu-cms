import { parse, visit, type DocumentNode } from "graphql";

/**
 * Cuánto cuesta una consulta, en unidades del mismo cupo que gasta REST.
 *
 * La regla es una sola y se puede explicar en una frase: **cada campo raíz
 * cuesta lo mismo que la llamada REST equivalente**. `{ posts { ... } }` gasta
 * lo que gasta `GET /posts`; pedir tres cosas en una consulta gasta lo que las
 * tres peticiones por separado.
 *
 * Eso cierra el agujero que abriría GraphQL sin coste variable —una consulta
 * con diez alias haría el trabajo de diez peticiones y descontaría una— sin
 * caer en el extremo contrario, que sería cobrar por elemento devuelto: `GET
 * /posts?limit=100` ya cuesta 1, así que cobrar 101 por la misma lectura haría
 * GraphQL cien veces más caro por hacer exactamente lo mismo. Con el cupo del
 * plan FREE en 60, ni siquiera sería más caro: sería imposible.
 *
 * El tamaño de página, por tanto, no entra en el precio. Lo que entra es
 * cuántas lecturas distintas se piden, que es lo que de verdad cuesta.
 */

/** Los campos que provocan una lectura, uno por cada endpoint REST. */
const ROOT_FIELDS = new Set(["posts", "post", "categories", "media", "mediaAsset"]);

/**
 * Recargo por pedir `content`.
 *
 * Es el único campo que hace trabajo extra por elemento: vuelve a firmar las
 * imágenes del cuerpo, una por una. En REST eso sólo ocurre en el detalle.
 */
const CONTENT_MULTIPLIER = 2;

/** Toda consulta cuesta al menos esto, aunque no pida nada. */
const MINIMUM_COST = 1;

const MAX_DEPTH = 8;

export class QueryTooComplexError extends Error {}

/**
 * Profundidad máxima.
 *
 * Sin ella, una consulta puede anidarse indefinidamente y obligar al servidor
 * a recorrer un documento enorme antes de rechazarlo. El límite es generoso:
 * el esquema real no pasa de cuatro niveles.
 */
function assertDepth(document: DocumentNode): void {
  let depth = 0;
  let max = 0;

  visit(document, {
    SelectionSet: {
      enter: () => {
        depth += 1;
        max = Math.max(max, depth);
      },
      leave: () => {
        depth -= 1;
      },
    },
  });

  if (max > MAX_DEPTH) {
    throw new QueryTooComplexError(
      `La consulta anida ${max} niveles y el máximo es ${MAX_DEPTH}.`,
    );
  }
}

export function estimateCost(query: string): number {
  let document: DocumentNode;
  try {
    document = parse(query);
  } catch {
    // Una consulta que ni siquiera parsea no llega a ejecutarse: cuesta lo
    // mínimo, pero cuesta — si no, un bucle de basura saldría gratis.
    return MINIMUM_COST;
  }

  assertDepth(document);

  let reads = 0;
  let wantsContent = false;

  visit(document, {
    Field: (node) => {
      if (node.name.value === "content") wantsContent = true;

      // Se cuenta el campo, no el alias: `a: posts` y `b: posts` son dos
      // lecturas y pagan dos. Sin esto, repetir la misma consulta con nombres
      // distintos sería la forma evidente de rodear el límite.
      if (ROOT_FIELDS.has(node.name.value)) reads += 1;
    },
  });

  const cost = Math.max(MINIMUM_COST, reads);
  return wantsContent ? cost * CONTENT_MULTIPLIER : cost;
}
