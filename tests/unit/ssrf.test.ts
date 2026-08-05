import { describe, it, expect } from "vitest";
import { rejectOutboundUrl } from "@/lib/security/ssrf";

/**
 * Los destinos de webhook los pide NUESTRO servidor. Una regresión aquí
 * convierte el CMS en un proxy hacia la red interna, y no da ningún síntoma
 * visible: el webhook "funciona", sólo que apunta donde no debe.
 */

describe("rejectOutboundUrl", () => {
  it("acepta endpoints públicos por HTTPS", () => {
    for (const url of [
      "https://rukma.studio/api/revalidate",
      "https://api.cliente.com:8443/hooks/kontororu",
      "https://sub.dominio.co.uk/x?token=abc",
    ]) {
      expect(rejectOutboundUrl(url), url).toBeNull();
    }
  });

  it("rechaza cualquier esquema que no sea HTTPS", () => {
    expect(rejectOutboundUrl("http://rukma.studio/hook")).toBe("scheme");
    expect(rejectOutboundUrl("ftp://rukma.studio")).toBe("scheme");
    // file: leería el disco del servidor.
    expect(rejectOutboundUrl("file:///etc/passwd")).toBe("scheme");
  });

  it("rechaza el endpoint de metadatos del proveedor cloud", () => {
    // El caso que más duele: devuelve credenciales IAM temporales.
    expect(rejectOutboundUrl("https://169.254.169.254/latest/meta-data/")).toBe(
      "private-host",
    );
  });

  it("rechaza loopback y rangos privados", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "[::1]",
      "servicio.internal",
      "caja.local",
    ]) {
      expect(rejectOutboundUrl(`https://${host}/hook`), host).toBe("private-host");
    }
  });

  it("no confunde rangos públicos con los privados de la misma familia", () => {
    // 172.32.x y 11.x quedan FUERA de RFC1918: bloquearlos sería un falso positivo.
    expect(rejectOutboundUrl("https://172.32.0.1/hook")).toBeNull();
    expect(rejectOutboundUrl("https://11.0.0.1/hook")).toBeNull();
    expect(rejectOutboundUrl("https://169.253.0.1/hook")).toBeNull();
  });

  it("rechaza credenciales embebidas en la URL", () => {
    expect(rejectOutboundUrl("https://user:pass@rukma.studio/hook")).toBe("credentials");
    // Vector de ofuscación: parece rukma.studio, va a evil.com.
    expect(rejectOutboundUrl("https://rukma.studio@evil.com/hook")).toBe("credentials");
  });

  it("rechaza cadenas que no son URL", () => {
    expect(rejectOutboundUrl("")).toBe("invalid");
    expect(rejectOutboundUrl("no soy una url")).toBe("invalid");
    expect(rejectOutboundUrl("//rukma.studio/hook")).toBe("invalid");
  });
});
