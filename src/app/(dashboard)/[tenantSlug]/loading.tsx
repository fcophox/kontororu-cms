/**
 * Esqueleto mientras se resuelven los datos del servidor.
 *
 * Sin esto, navegar entre secciones deja la pantalla anterior congelada sin
 * ninguna señal de que algo está pasando. Imita la forma de la mayoría de
 * páginas (cabecera + bloque) para que el salto al contenido real sea corto.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse p-8" aria-busy="true" aria-label="Cargando">
      <div className="mb-6">
        <div className="h-7 w-56 rounded bg-muted" />
        <div className="mt-2 h-4 w-32 rounded bg-muted" />
      </div>
      <div className="space-y-2 rounded-[var(--radius)] border bg-card p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
