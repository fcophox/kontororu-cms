import { FileQuestion } from "lucide-react";
import { StatusScreen, HomeButton } from "@/components/shared/status-screen";

export const metadata = { title: "No encontrado" };

/**
 * 404 global.
 *
 * También es lo que ve alguien que pide un espacio del que no es miembro:
 * `getTenantContext` llama a `notFound()` en vez de a `forbidden()` para no
 * confirmar que ese tenant existe.
 */
export default function NotFound() {
  return (
    <StatusScreen
      icon={FileQuestion}
      title="Aquí no hay nada"
      description="La página que buscas no existe, ha cambiado de dirección o no tienes acceso a ella."
      actions={<HomeButton />}
    />
  );
}
