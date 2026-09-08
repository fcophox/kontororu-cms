import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos y assets. Se excluyen explícitamente porque
     * hacer una llamada a `getUser()` por cada imagen multiplicaría la
     * latencia del dashboard sin aportar nada.
     *
     * `api/health` también queda fuera: lo llama el proveedor de despliegue
     * cada pocos segundos y pasarlo por `getUser()` ataría la salud de la app
     * a la disponibilidad de Supabase — un corte de la base pasaría a
     * provocar reinicios del contenedor, que no arreglan nada y añaden un
     * arranque en frío. Ver src/app/api/health/route.ts.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
