"use client";

import Link, { useLinkStatus } from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * La flecha se convierte en un giro mientras la vuelta está en camino.
 *
 * `useLinkStatus` sólo funciona dentro del propio <Link>, de ahí que sea un
 * componente aparte y no un estado del botón.
 */
function BackIcon() {
  const { pending } = useLinkStatus();

  return pending ? (
    <Loader2 className="size-4 animate-spin" />
  ) : (
    <ArrowLeft className="size-4" />
  );
}

/**
 * Volver, con acuse de recibo.
 *
 * En un espacio con mucho contenido, el listado tarda en resolverse en el
 * servidor y el editor se queda en pantalla mientras tanto: sin señal alguna,
 * el clic parece no haber entrado y se pulsa otra vez.
 *
 * Sigue siendo un enlace, no un botón con `router.push`: así conserva el
 * prefetch, abrirse en otra pestaña con Cmd+clic y el menú contextual. Lo
 * único que se añade es el aviso de que ya se está yendo.
 */
export function BackButton({
  href,
  label = "Volver",
}: {
  href: string;
  /** Se usa como `title` y como texto para lectores de pantalla. */
  label?: string;
}) {
  return (
    <Button variant="outline" size="icon" asChild className="size-8">
      <Link href={href} title={label} aria-label={label}>
        <BackIcon />
      </Link>
    </Button>
  );
}
