"use client";

import { useEffect, useState } from "react";

/**
 * Desenfoque progresivo fijo en el borde inferior de la pantalla: el
 * contenido se difumina al salir por abajo en vez de cortarse en seco.
 *
 * La técnica es la de GradualBlur de React Bits
 * (https://reactbits.dev/animations/gradual-blur): varias capas con
 * `backdrop-filter`, cada una más fuerte que la anterior y enmascarada a su
 * propia franja. Un solo `blur()` con un degradado de máscara no sirve: la
 * máscara reparte la OPACIDAD de un desenfoque uniforme, y lo que se ve es un
 * velo borroso, no un enfoque que se va perdiendo.
 *
 * Reescrita y no copiada: el original trae presets, dimensiones responsive
 * con listeners de resize y un `useMemo` sobre `props` que se recalcula en
 * cada render. Aquí la configuración es fija, así que las capas se calculan
 * una vez al cargar el módulo.
 *
 * Se apaga cuando asoma el pie de página. Si no, la última franja de la
 * pantalla —justo donde están los enlaces legales— quedaría siempre borrosa
 * al llegar al final, y no hay más scroll para sacarla de ahí.
 */

/** Capas. Más capas, transición más suave; cada una es un `backdrop-filter`. */
const LAYERS = 6;
/** Desenfoque de la capa más fuerte, la del borde, en px. */
const MAX_BLUR = 12;

// Curva exponencial: casi nada arriba y el grueso del desenfoque pegado al
// borde. Con una lineal la franja entera se ve igual de "sucia".
const LAYER_STYLES = Array.from({ length: LAYERS }, (_, i) => {
  const step = 100 / LAYERS;
  const start = step * i;
  const blur = MAX_BLUR * 2 ** (i + 1 - LAYERS);
  // Cada capa aparece en su franja y se mantiene hasta el borde: así las
  // más débiles quedan debajo de las fuertes y no hay escalones visibles.
  const mask = `linear-gradient(to bottom, transparent ${start}%, black ${start + step}%)`;
  return {
    backdropFilter: `blur(${blur.toFixed(2)}px)`,
    WebkitBackdropFilter: `blur(${blur.toFixed(2)}px)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  } satisfies React.CSSProperties;
});

export function GradualBlur({ hideWhen = "footer" }: { hideWhen?: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.querySelector(hideWhen);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [hideWhen]);

  return (
    <div
      aria-hidden
      data-hidden={hidden}
      // z-40: por encima del contenido y las demos, por debajo de la barra
      // fija (z-50), que tiene su propio desenfoque.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-24 transition-opacity duration-300 ease-out data-[hidden=true]:opacity-0 sm:h-28"
    >
      {LAYER_STYLES.map((style, i) => (
        <div key={i} className="absolute inset-0" style={style} />
      ))}
    </div>
  );
}
