"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GALLERY_OPTIONS, type GalleryValue } from "@/lib/addons/portfolio";

/**
 * El encargo para quien programa la web del cliente, listo para copiar.
 *
 * Vive en la pantalla y no en la documentación por lo mismo que el snippet de
 * Reacciones: quien activa el complemento es quien tiene que pedir la sección,
 * casi nunca es quien la va a programar, y el texto trae ya los datos que sólo
 * se conocen aquí —la URL del endpoint y la galería elegida—. Sin esto, esa
 * conversación empieza con un «pregúntale a Rukma cómo se conecta».
 */
export function PortfolioBrief({ gallery }: { gallery: GalleryValue }) {
  const [isCopied, setIsCopied] = useState(false);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const endpoint = `${base}/api/v1/addons/portfolio`;
  const galleryLabel =
    GALLERY_OPTIONS.find((option) => option.value === gallery)?.label ?? gallery;

  const brief = `Necesito una sección de portfolio en la web, alimentada desde el CMS.

DE DÓNDE SALEN LOS DATOS
GET ${endpoint}
Cabecera: Authorization: Bearer <API Key del espacio>
La clave se crea en el panel, en Ajustes → Claves de API, con el permiso content:read.
Llámalo desde el servidor, nunca desde el navegador: la clave no puede acabar en el código público de la web.

QUÉ DEVUELVE
{
  "data": {
    "gallery": "${gallery}",
    "items": [
      {
        "id": "…",
        "title": "Título del trabajo",
        "description": "Texto largo, puede venir vacío",
        "category": "Fotografía o null",
        "externalUrl": "https://… o null",
        "image": { "url": "…", "alt": "…", "width": 1600, "height": 900 },
        "createdAt": "2026-08-20T10:00:00.000Z"
      }
    ]
  }
}

QUÉ HAY QUE MONTAR
- Una tarjeta por elemento de "items", en el orden en que llegan (el más reciente primero).
- Cada tarjeta: imagen, título, descripción y la categoría como etiqueta.
- Si "externalUrl" no es null, la tarjeta enlaza ahí, en pestaña nueva y con rel="noopener".
- Si "image" es null, la tarjeta se maqueta igual sin foto: no la ocultes.
- Si "category" no es null, se puede usar para filtrar la rejilla.
- Plantilla elegida ahora mismo en el panel: ${galleryLabel} ("${gallery}"). El campo "gallery" puede cambiar desde el panel, así que léelo de la respuesta en vez de fijarlo en el código.

CUÁNDO NO SE PINTA
Si el endpoint responde 404, la sección de portfolio NO se muestra: significa que en el panel está desactivada la visibilidad. No es un error, no hace falta avisar de nada; simplemente no se pinta la sección ni su enlace en el menú.

CADA CUÁNTO SE ACTUALIZA
Las imágenes llegan con URL firmada que caduca en 24 horas, así que no las descargues ni las guardes en tu propio caché más allá de ese plazo: vuelve a pedir el endpoint.
Si la web es estática, revalida al menos una vez al día. Para que los cambios salgan al momento, suscríbete al webhook addon.updated desde Ajustes → Webhooks y revalida la sección al recibirlo.`;

  const copy = async () => {
    await navigator.clipboard.writeText(brief);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <section className="mt-8 rounded-[var(--radius)] border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Pedir la sección a tu equipo técnico</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copia este texto y mándalo a quien lleva tu web. Trae todo lo que
            necesita: de dónde saca los trabajos, qué le va a llegar y qué hacer
            cuando apagues la visibilidad.
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {isCopied ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <pre className="mt-4 max-h-80 overflow-auto rounded-[var(--radius)] bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
        <code>{brief}</code>
      </pre>
    </section>
  );
}
