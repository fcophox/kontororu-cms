import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme/mode";

/**
 * Script bloqueante en <head>. El servidor pinta siempre el tema por defecto
 * (oscuro); esto corrige la clase ANTES del primer paint para quien haya
 * elegido claro, que es lo que evita el flash de tema equivocado.
 *
 * Va inline y sin dependencias a propósito: cualquier import lo convertiría
 * en un chunk asíncrono y volvería el flash.
 */
export function ThemeScript() {
  const js = `(function(){try{
var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(m!=="dark"&&m!=="light")m=${JSON.stringify(DEFAULT_THEME)};
var r=document.documentElement;
r.classList.toggle("dark",m==="dark");
r.classList.toggle("light",m==="light");
r.style.colorScheme=m;
}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
