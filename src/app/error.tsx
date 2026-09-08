"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
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
    // El `digest` es lo que ve la persona en pantalla; mandarlo como etiqueta
    // es lo que permite que un aviso de "me sale la referencia abc123" lleve
    // directo al evento en vez de a una búsqueda a ciegas por los logs.
    Sentry.captureException(error, { tags: { digest: error.digest } });
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
