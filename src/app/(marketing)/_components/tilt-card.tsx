"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inclina una maqueta siguiendo al ratón.
 *
 * El movimiento es `transform` puro —rotateX/rotateY sobre una perspectiva—,
 * así que vive en el compositor y no dispara ni maquetación ni pintado. El JS
 * de aquí no anima: sólo fija el destino una vez por fotograma y deja que la
 * transición de CSS haga el recorrido.
 */

/** Grados en el borde. */
const DEFAULT_TILT = 10;

/**
 * Distancia de la cámara al plano de la tarjeta.
 *
 * Va al revés de lo que sugiere el nombre: cuanto MENOR es el número, más
 * cerca está el ojo y más se nota el escorzo —la esquina que se acerca crece
 * y la que se aleja encoge—. Subirlo aplana la escena hasta que el giro
 * parece un simple sesgado.
 */
const PERSPECTIVE = 900;

/**
 * El `transform` para un cursor en (x, y), ambos de −0.5 a 0.5 desde el
 * centro de la tarjeta.
 *
 * Está fuera del componente y es puro para poder fijar los SIGNOS con un
 * test: son lo único aquí que no se puede razonar leyendo el código, y
 * equivocarlos no rompe nada —simplemente la tarjeta huye del ratón en vez
 * de asomarse a él, y eso sólo se ve mirándolo.
 *
 * Tal y como están: la esquina bajo el cursor se ACERCA, como si tirara de
 * ella. Invertir los dos signos la aleja, que se lee como apretarla.
 */
export function tiltTransform(x: number, y: number, tilt: number) {
  const rotateX = (y * tilt).toFixed(2);
  const rotateY = (-x * tilt).toFixed(2);
  return `perspective(${PERSPECTIVE}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
}

export function TiltCard({
  children,
  tilt = DEFAULT_TILT,
  className = "",
}: {
  children: React.ReactNode;
  /** Las maquetas grandes piden menos: el mismo ángulo recorre más píxeles. */
  tilt?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Puntero fino Y con hover de verdad: en táctil el hover lo dispara el
    // toque y la tarjeta se quedaría torcida hasta que tocases otra cosa.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !calm.matches);

    sync();
    fine.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      calm.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const paint = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const px = pointerX - rect.left;
      const py = pointerY - rect.top;
      // −0.5 a 0.5 desde el centro.
      const x = px / rect.width - 0.5;
      const y = py / rect.height - 0.5;

      // Se escribe el `transform` EN el elemento, no una variable CSS en el
      // padre. Una variable es heredable: tocarla obliga a recalcular estilo
      // en todos los descendientes, y estas maquetas tienen decenas.
      el.style.transform = tiltTransform(x, y, tilt);
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      // Un solo escrito por fotograma: `pointermove` dispara más veces de las
      // que el navegador llega a pintar.
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onEnter = (event: PointerEvent) => {
      el.dataset.tilting = "";
      onMove(event);
    };

    const onLeave = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      // Primero fuera el atributo —así manda la transición larga— y luego el
      // transform, que es lo que la dispara.
      delete el.dataset.tilting;
      el.style.transform = "";
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      onLeave();
    };
  }, [enabled, tilt]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
