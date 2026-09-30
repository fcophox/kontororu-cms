import { describe, it, expect } from "vitest";
import { tiltTransform } from "@/app/(marketing)/_components/tilt-card";

/**
 * Tests de la inclinación de las maquetas de la portada.
 *
 * Lo único que se fija aquí son los SIGNOS. El resto del efecto se lee del
 * código, pero la dirección no: con los signos invertidos la tarjeta se
 * aparta del ratón en vez de asomarse a él, nada falla, y el error sólo se
 * descubre mirándolo en pantalla.
 *
 * El criterio: la esquina bajo el cursor se ACERCA al que mira.
 *
 * En CSS el eje +X va a la derecha, +Y hacia abajo y +Z hacia el espectador.
 * `rotateX` positivo gira de +Y a +Z, así que acerca el borde inferior;
 * `rotateY` positivo gira de +Z a +X, así que acerca el izquierdo.
 */

/** Grados de `rotateX`/`rotateY` de la cadena, con su signo. */
function angles(transform: string) {
  const [rotateX, rotateY] = [...transform.matchAll(/rotate[XY]\((-?[\d.]+)deg\)/g)].map((m) =>
    Number(m[1]),
  );
  return { rotateX, rotateY };
}

describe("tiltTransform", () => {
  it("en el centro no inclina nada", () => {
    expect(angles(tiltTransform(0, 0, 6))).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("con el cursor abajo acerca el borde inferior", () => {
    expect(angles(tiltTransform(0, 0.5, 6)).rotateX).toBeGreaterThan(0);
  });

  it("con el cursor arriba acerca el borde superior", () => {
    expect(angles(tiltTransform(0, -0.5, 6)).rotateX).toBeLessThan(0);
  });

  it("con el cursor a la derecha acerca el borde derecho", () => {
    // Acercar la derecha es alejar la izquierda: rotateY negativo.
    expect(angles(tiltTransform(0.5, 0, 6)).rotateY).toBeLessThan(0);
  });

  it("con el cursor a la izquierda acerca el borde izquierdo", () => {
    expect(angles(tiltTransform(-0.5, 0, 6)).rotateY).toBeGreaterThan(0);
  });

  it("no pasa de la mitad del ángulo máximo, porque el borde es 0.5", () => {
    const { rotateX, rotateY } = angles(tiltTransform(0.5, 0.5, 6));
    expect(Math.abs(rotateX)).toBeCloseTo(3);
    expect(Math.abs(rotateY)).toBeCloseTo(3);
  });

  it("escala con el ángulo que se le pase", () => {
    expect(angles(tiltTransform(0.5, 0, 4)).rotateY).toBeCloseTo(-2);
  });
});
