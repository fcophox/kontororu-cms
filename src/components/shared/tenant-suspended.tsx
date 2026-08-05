import Link from "next/link";
import { PauseCircle } from "lucide-react";

/**
 * Pantalla de tenant suspendido o cancelado.
 *
 * Se renderiza EN LUGAR del dashboard, sin cambiar de URL: así el cliente
 * puede recargar o compartir el enlace sin acabar en una ruta distinta, y no
 * hay redirect que pueda entrar en bucle con el layout.
 *
 * No se detalla el motivo: puede ser impago, y esa conversación la tiene
 * Rukma Studio con quien firma, no con el editor de contenidos que abrió
 * el panel esta mañana.
 */
export function TenantSuspended({
  tenantName,
  status,
}: {
  tenantName: string;
  status: "SUSPENDED" | "CANCELLED";
}) {
  const cancelled = status === "CANCELLED";

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-md text-center">
        <PauseCircle className="mx-auto size-10 text-muted-foreground" />

        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {cancelled ? "Este espacio está cerrado" : "Este espacio está en pausa"}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          El acceso a <strong className="text-foreground">{tenantName}</strong>{" "}
          {cancelled
            ? "se ha dado de baja. El contenido se conserva y puede reactivarse."
            : "está temporalmente suspendido."}{" "}
          Escribe a Rukma Studio para reactivarlo.
        </p>

        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <a href="mailto:hola@rukma.studio" className="underline underline-offset-4">
            Contactar con Rukma Studio
          </a>
          <Link href="/switch" className="text-muted-foreground hover:text-foreground">
            Otros espacios
          </Link>
        </div>
      </div>
    </main>
  );
}
