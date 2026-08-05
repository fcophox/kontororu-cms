import { describe, it, expect } from "vitest";
import type { Event } from "@sentry/nextjs";
import { redactSecrets, redactUrl, scrubEvent } from "@/lib/observability/scrub";

/**
 * Lo que sale hacia Sentry.
 *
 * Es el único código de este proyecto cuyo fallo no se nota nunca: si el
 * saneado se rompe, todo sigue funcionando y las claves aparecen en un panel
 * de terceros que nadie mira con esa intención. No hay test de integración que
 * lo pille, así que tiene que estar cubierto aquí.
 */

describe("redactSecrets", () => {
  it("borra una API Key de Kontorōru", () => {
    const texto = "falló GET con Authorization: kntr_live_abc123def456.SUPERSECRETO999";
    const limpio = redactSecrets(texto);

    expect(limpio).not.toContain("SUPERSECRETO999");
    expect(limpio).not.toContain("kntr_live_abc123def456");
    expect(limpio).toContain("[redactado]");
  });

  it("borra un JWT, que es como viaja la service role key", () => {
    // Esa clave bypassea RLS por completo: en un panel de errores vale tanto
    // como la base de datos entera.
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.EGIM96RAZx35lJzdJsyH";
    const limpio = redactSecrets(`conexión rechazada con ${jwt}`);

    expect(limpio).not.toContain(jwt);
    expect(limpio).toContain("[redactado]");
  });

  it("borra un Bearer suelto en un mensaje", () => {
    const limpio = redactSecrets("fetch failed (Bearer sk_test_9f8a7b6c5d4e3f2a1b)");
    expect(limpio).not.toContain("sk_test_9f8a7b6c5d4e3f2a1b");
  });

  it("no toca un texto sin secretos", () => {
    const texto = "No hay contenido publicado en \"mi-articulo\" (idioma es).";
    expect(redactSecrets(texto)).toBe(texto);
  });
});

describe("redactUrl", () => {
  it("tapa los parámetros sensibles y conserva los útiles", () => {
    // Sin `locale` y `category` la URL no sirve para reproducir nada; el
    // saneado tiene que ser quirúrgico, no un borrado en bloque.
    const limpia = redactUrl("/api/v1/posts?locale=es&category=blog&token=abc123secreto");

    expect(limpia).toContain("locale=es");
    expect(limpia).toContain("category=blog");
    expect(limpia).not.toContain("abc123secreto");
  });

  it("acepta URLs relativas sin inventarse un dominio", () => {
    expect(redactUrl("/api/v1/posts?limit=10")).toBe("/api/v1/posts?limit=10");
  });

  it("conserva el dominio cuando la URL es absoluta", () => {
    const limpia = redactUrl("https://cms.ejemplo.com/api/v1/media?type=image");
    expect(limpia).toContain("https://cms.ejemplo.com/api/v1/media");
  });

  it("no revienta con una URL malformada", () => {
    expect(() => redactUrl("esto no es :// una url")).not.toThrow();
  });
});

describe("scrubEvent", () => {
  const evento = (): Event => ({
    request: {
      url: "https://cms.ejemplo.com/api/v1/posts?locale=es&secret=nolodigas",
      method: "GET",
      headers: {
        Authorization: "Bearer kntr_live_abc123.SECRETO",
        Cookie: "sb-access-token=xyz",
        apikey: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firmafirma",
        "User-Agent": "next/15",
        "Content-Type": "application/json",
      },
      cookies: { "sb-access-token": "xyz" },
      data: { query: "{ posts { nodes { title } } }", variables: { borrador: "texto privado" } },
      query_string: "locale=es&secret=nolodigas",
    },
    user: { id: "u-1", email: "persona@cliente.com", ip_address: "88.1.2.3" },
    message: "falló algo con kntr_live_abc123.SECRETO",
    exception: {
      values: [{ type: "Error", value: "conexión rechazada usando kntr_live_abc123.SECRETO" }],
    },
  });

  it("borra las cabeceras con credenciales y deja las inocuas", () => {
    const limpio = scrubEvent(evento());
    const headers = limpio.request!.headers!;

    expect(headers).not.toHaveProperty("Authorization");
    expect(headers).not.toHaveProperty("Cookie");
    expect(headers).not.toHaveProperty("apikey");
    expect(headers["User-Agent"]).toBe("next/15");
  });

  it("borra las cookies enteras: son la sesión del panel", () => {
    expect(scrubEvent(evento()).request!.cookies).toBeUndefined();
  });

  it("borra el cuerpo, que es donde va el contenido del cliente", () => {
    // Un borrador sin publicar no debe acabar en un servicio de terceros por
    // el camino de un informe de error.
    const limpio = scrubEvent(evento());

    expect(limpio.request!.data).toBeUndefined();
    expect(JSON.stringify(limpio)).not.toContain("texto privado");
  });

  it("deja del usuario sólo el id", () => {
    const user = scrubEvent(evento()).user!;

    expect(user.id).toBe("u-1");
    expect(user.email).toBeUndefined();
    expect(user.ip_address).toBeUndefined();
  });

  it("redacta secretos en el mensaje y en la excepción", () => {
    const limpio = scrubEvent(evento());

    expect(limpio.message).not.toContain("SECRETO");
    expect(limpio.exception!.values![0].value).not.toContain("SECRETO");
  });

  it("tapa los parámetros sensibles de la URL y de la query", () => {
    const limpio = scrubEvent(evento());

    expect(limpio.request!.url).not.toContain("nolodigas");
    expect(limpio.request!.query_string).not.toContain("nolodigas");
    expect(limpio.request!.query_string).toContain("locale=es");
  });

  /**
   * La prueba que resume todas las anteriores: se serializa el evento entero y
   * se busca cada secreto. Si mañana alguien añade un campo nuevo al evento y
   * se olvida de sanearlo, este test cae aunque los otros pasen.
   */
  it("ningún secreto sobrevive en el evento serializado", () => {
    const serializado = JSON.stringify(scrubEvent(evento()));

    for (const secreto of [
      "SECRETO",
      "sb-access-token=xyz",
      "nolodigas",
      "persona@cliente.com",
      "88.1.2.3",
      "firmafirma",
    ]) {
      expect(serializado).not.toContain(secreto);
    }
  });

  it("no falla con un evento sin request ni usuario", () => {
    expect(() => scrubEvent({ message: "hola" })).not.toThrow();
  });
});
