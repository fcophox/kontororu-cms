"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error dentro del dashboard.
 *
 * Está a nivel de segmento, no de raíz, para que la barra lateral siga en pie:
 * el usuario puede irse a otra sección en vez de quedarse en una pantalla
 * muerta. Sólo cubre lo que hay DEBAJO del layout; si falla el propio layout
 * (por ejemplo al resolver el tenant), lo recoge el boundary raíz.
 */
export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60svh] place-items-center p-8">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-3 font-semibold">No hemos podido cargar esta sección</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {error.digest ? `Referencia: ${error.digest}` : error.message}
        </p>
        <Button onClick={reset} className="mt-5" size="sm">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
