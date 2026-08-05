import Link from "next/link";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { Building2, ScrollText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/tenant-context";

/**
 * El título se decide aquí y no en cada página.
 *
 * Los metadatos de una página se resuelven aunque su layout llame a
 * `notFound()`: un título como "Clientes · Plataforma" en la pestaña le
 * confirmaba a un cliente que /admin existe, que es justo lo que el 404
 * pretende ocultar.
 */
export async function generateMetadata() {
  const user = await getCurrentUser();
  // `absolute` evita que la plantilla del layout raíz añada su sufijo y deje
  // el título repetido ("Kontorōru · Kontorōru").
  return {
    title: { absolute: user?.isSuperadmin ? "Plataforma · Kontorōru" : "Kontorōru" },
  };
}

/**
 * Panel de plataforma de Rukma Studio.
 *
 * Deliberadamente NO usa `<TenantTheme>`: aquí se opera sobre todos los
 * clientes a la vez, y llevar la marca de uno sería desorientador. La barra
 * oscura fija existe para que nadie confunda esta pantalla con el dashboard
 * de un cliente — es donde se suspende a alguien por error.
 *
 * A quien no es SuperAdmin se le devuelve 404, no 403: que exista un panel
 * de plataforma no es información que deba confirmarse a un cliente.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuperadmin) notFound();

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <span className="grid size-6 place-items-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-950">
              RS
            </span>
            Plataforma
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100">
              <Building2 className="size-4" />
              Clientes
            </Link>
            <Link
              href="/admin/audit"
              className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100"
            >
              <ScrollText className="size-4" />
              Actividad
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-zinc-400">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-zinc-400 hover:text-zinc-100">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
