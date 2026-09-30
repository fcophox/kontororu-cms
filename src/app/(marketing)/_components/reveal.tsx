"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Revela su contenido cuando entra en pantalla, una sola vez.
 *
 * Es la única pieza de cliente de la landing. La alternativa —animar todo al
 * cargar— haría que quien llega ya se pierda las secciones de abajo, y
 * `animation-timeline: view()` todavía no está en todos los navegadores.
 *
 * El observer se desconecta al primer cruce: un elemento que ya se ha visto
 * no vuelve a esconderse al subir, que es lo que espera quien relee algo.
 *
 * Transición y no keyframes a propósito: si alguien hace scroll rápido y el
 * elemento entra a medio camino, una transición retoma desde donde está en
 * vez de reiniciarse.
 */
export function Reveal({
  children,
  delay = 0,
  blur = false,
  margin = "0px 0px -80px 0px",
  className = "",
}: {
  children: React.ReactNode;
  /** Escalonado dentro de un grupo. Máximo 3-4 pasos: más se nota lento. */
  delay?: number;
  /**
   * Añade el enfoque al fundido. Sólo para el texto que manda en la sección
   * —titular, cifra, cita—: el desenfoque repinta, y ponerlo en una rejilla
   * entera se paga en fotogramas sin que nadie lo note.
   */
  blur?: boolean;
  /**
   * `rootMargin` del observer. Por defecto dispara en cuanto el bloque entra
   * de verdad, que es lo que quiere un texto.
   *
   * Lo que envuelve una animación LARGA necesita otro valor. Con el de por
   * defecto, una demo de tres segundos arranca asomando por el borde de
   * abajo y se acaba antes de que llegues a mirarla. Un margen inferior en
   * porcentaje la retrasa hasta que está de verdad en pantalla.
   */
  margin?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Sin IntersectionObserver (o con JS a medio cargar) el contenido debe
    // quedarse visible: una landing que no se ve es peor que una sin animar.
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // Un margen negativo abajo retrasa el disparo hasta que el bloque está
      // realmente entrando, no asomando un píxel.
      { rootMargin: margin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [margin]);

  // `motion-reduce` deja el fundido y quita lo que marea: el desplazamiento
  // y el desenfoque. Menos movimiento, no cero.
  const motion = blur
    ? "reveal-blur translate-y-2.5 opacity-0 duration-700 data-shown:translate-y-0 data-shown:opacity-100 motion-reduce:translate-y-0"
    : "translate-y-2 opacity-0 duration-500 data-shown:translate-y-0 data-shown:opacity-100 motion-reduce:translate-y-0";

  return (
    <div
      ref={ref}
      data-shown={shown || undefined}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform,filter] ease-[cubic-bezier(0.16,1,0.3,1)] ${motion} ${className}`}
    >
      {children}
    </div>
  );
}
