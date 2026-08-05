"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { StatusScreen, HomeButton } from "@/components/shared/status-screen";
import { Button } from "@/components/ui/button";

/**
 * Boundary de error de la aplicación. Debe ser Client Component: React
 * necesita estado de cliente para reintentar el render.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En producción, aquí va el reporte a Sentry/Logflare (Fase 3).
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      icon={AlertTriangle}
      title="Algo ha fallado"
      description="No hemos podido cargar esta página. Suele ser temporal: vuelve a intentarlo."
      // En producción Next reemplaza el mensaje por un `digest`; se muestra
      // porque es lo único que permite localizar el error en los logs.
      detail={error.digest ? `Referencia: ${error.digest}` : error.message}
      actions={
        <>
          <Button onClick={reset}>Reintentar</Button>
          <HomeButton />
        </>
      }
    />
  );
}
