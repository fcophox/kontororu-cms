"use client";

/**
 * Último recurso: sólo salta si el propio root layout falla, así que
 * reemplaza a <html> y <body> por completo. Por eso no usa StatusScreen
 * ni Tailwind — nada de eso está garantizado a esta altura.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          color: "#0a0a0a",
          background: "#fff",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kontorōru no ha podido arrancar</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#71717a" }}>
            Ha fallado algo fuera de la aplicación.
            {error.digest ? ` Referencia: ${error.digest}.` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
