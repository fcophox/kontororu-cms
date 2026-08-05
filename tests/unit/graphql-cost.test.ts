import { describe, it, expect } from "vitest";
import { estimateCost, QueryTooComplexError } from "@/lib/api/graphql/cost";

/**
 * El estimador de coste es el freno de GraphQL.
 *
 * Sin él, `/graphql` sería una puerta trasera al limitador: una consulta con
 * diez alias haría el trabajo de diez peticiones REST y descontaría una.
 *
 * Lo que se comprueba aquí es la regla completa: cada campo raíz cuesta lo
 * mismo que su llamada REST, ni más ni menos. "Ni más" importa tanto como "ni
 * menos" — cobrar por elemento devuelto dejaría al plan FREE sin poder pedir
 * una página de 100 que por REST le cuesta 1.
 */

describe("estimateCost", () => {
  it("cobra una unidad por una lectura, igual que la llamada REST equivalente", () => {
    expect(estimateCost(`{ categories { id } }`)).toBe(1);
    expect(estimateCost(`{ posts { nodes { id } } }`)).toBe(1);
  });

  it("no cobra por tamaño de página: REST tampoco lo hace", () => {
    // Regresión: cobrar por elemento hacía que `posts(limit: 100)` costase 101
    // y el plan FREE (60/min) no pudiera ejecutarlo NUNCA, mientras que
    // `GET /posts?limit=100` le costaba 1.
    const uno = estimateCost(`{ posts(limit: 1) { nodes { id } } }`);
    const cien = estimateCost(`{ posts(limit: 100) { nodes { id } } }`);

    expect(uno).toBe(cien);
    expect(cien).toBe(1);
  });

  it("suma una unidad por cada lectura distinta", () => {
    const query = `{
      posts { nodes { id } }
      categories { id }
      media { nodes { id } }
    }`;
    // Exactamente lo que costarían las tres peticiones REST por separado.
    expect(estimateCost(query)).toBe(3);
  });

  /**
   * El agujero evidente: pedir lo mismo diez veces con nombres distintos.
   *
   * Si los alias no sumasen, una petición haría el trabajo de diez y pagaría
   * por una.
   */
  it("cuenta cada alias por separado", () => {
    const query = `{
      a: posts(limit: 100) { nodes { id } }
      b: posts(limit: 100) { nodes { id } }
      c: posts(limit: 100) { nodes { id } }
    }`;
    expect(estimateCost(query)).toBe(3);
  });

  it("recarga por pedir el cuerpo, que vuelve a firmar imagen por imagen", () => {
    const sin = estimateCost(`{ post(slug: "x") { title } }`);
    const con = estimateCost(`{ post(slug: "x") { title content { html } } }`);

    expect(sin).toBe(1);
    expect(con).toBe(2);
  });

  it("una consulta cara sigue cabiendo en el plan más pequeño", () => {
    // FREE son 60 unidades por minuto: ninguna consulta razonable debe
    // agotarlo de una sola vez.
    const gorda = `{
      posts(limit: 100) { nodes { id title cover { url } category { slug } } }
      categories { id postCount }
      media(limit: 100) { nodes { id url } }
    }`;
    expect(estimateCost(gorda)).toBeLessThanOrEqual(10);
  });

  it("rechaza el anidamiento excesivo antes de ejecutarlo", () => {
    // 10 niveles: por encima del máximo de 8.
    const profunda = `{ a { b { c { d { e { f { g { h { i { j } } } } } } } } } }`;
    expect(() => estimateCost(profunda)).toThrow(QueryTooComplexError);
  });

  it("cobra el mínimo a lo que ni siquiera parsea", () => {
    // Cuesta poco, pero cuesta: si fuese gratis, un bucle de basura no
    // encontraría ningún freno.
    expect(estimateCost("esto no es graphql {{{")).toBe(1);
  });
});
