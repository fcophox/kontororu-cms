import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Nunca cachear: una comprobación de salud servida desde caché diría que la
// app está viva mucho después de que dejara de estarlo.
export const dynamic = "force-dynamic";

/**
 * Comprobación de salud para el proveedor de despliegue (`healthCheckPath` en
 * render.yaml).
 *
 * Responde con lo mínimo A PROPÓSITO: no consulta Supabase ni el Storage. Un
 * health check que depende de la base convierte cualquier corte de Supabase en
 * un reinicio de la app — y reiniciar el contenedor no arregla la base, sólo
 * añade un arranque en frío encima de la incidencia. Lo que se comprueba aquí
 * es "el proceso de Next acepta peticiones", que es justo lo que el proveedor
 * puede arreglar reiniciando.
 *
 * Por el mismo motivo queda fuera del matcher de src/middleware.ts.
 */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
