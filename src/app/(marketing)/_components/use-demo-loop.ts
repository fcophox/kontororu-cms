"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ¿Está esto en pantalla, y quiere esta persona movimiento?
 *
 * A diferencia de <Reveal>, que se dispara UNA vez y se desconecta, este
 * observer alterna: hace falta para poder parar las demos al salir de
 * pantalla. Con animaciones infinitas eso no es una optimización opcional
 * —son tres bloques animándose para siempre y a la vez en una página por la
 * que se sigue bajando.
 */
export function useInView<T extends HTMLElement>(rootMargin = "0px 0px -25% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);

    // Sin observer, todo visible y quieto: una demo que no se ve es peor que
    // una que no se mueve.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return () => query.removeEventListener("change", onChange);
    }

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin,
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", onChange);
    };
  }, [rootMargin]);

  return { ref, inView, reduced };
}

/**
 * Bucle de una demo que no se toca (la 1 y la 3).
 *
 * `cycle` va montado como `key`: al subir, React desmonta y vuelve a montar
 * el contenido, y con él arrancan de cero TODAS las animaciones CSS de
 * dentro. Es lo que evita tener que reescribir los doce keyframes con sus
 * tiempos en porcentajes de un ciclo común — con `animation-delay` y
 * `infinite`, el retraso sólo cuenta en la primera vuelta y a la segunda
 * cada elemento va por su cuenta.
 *
 * Al volver a pantalla el ciclo empieza de nuevo en vez de retomarse por la
 * mitad: quien vuelve a mirar quiere ver la demo, no su último tercio.
 */
export function useDemoLoop<T extends HTMLElement>(period: number) {
  const { ref, inView, reduced } = useInView<T>();
  const [cycle, setCycle] = useState(0);
  const playing = inView && !reduced;

  useEffect(() => {
    if (!playing) return;

    setCycle((c) => c + 1);
    const id = setInterval(() => setCycle((c) => c + 1), period);
    return () => clearInterval(id);
  }, [playing, period]);

  return { ref, cycle, playing };
}
