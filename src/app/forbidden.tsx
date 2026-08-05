import { ShieldX } from "lucide-react";
import { StatusScreen, HomeButton } from "@/components/shared/status-screen";

export const metadata = { title: "Sin permiso" };

/**
 * Lo que renderiza `forbidden()` de los guards de rol.
 *
 * A diferencia del 404, aquí SÍ se confirma que el recurso existe: el usuario
 * pertenece al espacio, sólo que su rol no llega. Decirlo claro le ahorra
 * pensar que algo está roto.
 */
export default function Forbidden() {
  return (
    <StatusScreen
      icon={ShieldX}
      title="No tienes permiso"
      description="Tu rol en este espacio no permite acceder a esta sección. Pide a un administrador que lo amplíe si lo necesitas."
      actions={<HomeButton />}
    />
  );
}
