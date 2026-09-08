/**
 * Cómo conectar el botón de la web con el contador.
 *
 * Va en la propia pantalla y no en la documentación porque quien activa el
 * complemento es quien lo va a conectar, y el dato que necesita —el
 * identificador de SU espacio— sólo se conoce aquí.
 */
export function ReactionSnippet({ tenantSlug }: { tenantSlug: string }) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const post = `await fetch("${base}/api/v1/reactions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tenant: "${tenantSlug}",
    slug: "mi-articulo",   // el slug del contenido
    reaction: "like",      // o "clap", "smile", el gesto que uses
  }),
});`;

  const get = `${base}/api/v1/reactions?tenant=${tenantSlug}&slug=mi-articulo`;

  return (
    <section className="mt-8 rounded-[var(--radius)] border bg-card p-5">
      <h2 className="text-sm font-semibold">Conectar tu web</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Este endpoint no lleva clave de API: lo llama el navegador de quien lee.
        No hay nada que exponer —sólo suma un contador de contenido publicado— y
        una clave dentro del código de tu web la vería cualquiera.
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Al pulsar el gesto — devuelve el total ya actualizado
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius)] bg-muted p-3 text-xs leading-relaxed">
          <code>{post}</code>
        </pre>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Al cargar el artículo — los números actuales
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius)] bg-muted p-3 text-xs leading-relaxed">
          <code>{get}</code>
        </pre>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Guarda en <code className="rounded bg-muted px-1 py-0.5">localStorage</code> que
        esa persona ya reaccionó, para que el botón no vuelva a sumar. Aquí no se
        guarda nada del visitante —ni IP, ni cookie, ni huella—, así que el
        límite de uno por persona sólo puede vivir en su navegador.
      </p>
    </section>
  );
}
