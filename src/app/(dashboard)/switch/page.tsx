import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentUser, getUserTenants } from "@/lib/auth/tenant-context";
import { parseBranding } from "@/lib/theme/branding";

export const metadata = { title: "Elegir espacio" };

/**
 * Selector de espacio de trabajo.
 *
 * Con un solo tenant redirige directamente: obligar a elegir cuando no hay
 * elección es fricción pura. Sólo aparece si el usuario colabora con varios
 * clientes — una agencia, o el propio equipo de Rukma Studio.
 */
export default async function SwitchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tenants = await getUserTenants();

  if (tenants.length === 1) redirect(`/${tenants[0].slug}`);

  return (
    <main className="grid min-h-svh place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenants.length === 0 ? "Sin espacios asignados" : "Elige un espacio"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </header>

        {tenants.length === 0 ? (
          <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-sm text-muted-foreground">
            <p>Tu cuenta todavía no pertenece a ningún espacio de trabajo.</p>
            <p className="mt-2">
              Rukma Studio gestiona las altas por invitación: si esperabas
              acceso, escribe a quien te invitó.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tenants.map((tenant) => {
              const branding = parseBranding(tenant.branding);
              const suspended = tenant.status !== "ACTIVE" && tenant.status !== "TRIAL";

              return (
                <li key={tenant.id}>
                  <Link
                    href={`/${tenant.slug}`}
                    aria-disabled={suspended}
                    className={`flex items-center gap-3 rounded-[var(--radius)] border bg-card p-4 transition-colors hover:bg-accent ${
                      suspended ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    {/* El color de marca aquí es la pista más rápida para
                        distinguir espacios: se reconoce antes que el nombre. */}
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded text-xs font-semibold text-white"
                      style={{ background: branding.primary }}
                    >
                      {tenant.name.slice(0, 2).toUpperCase()}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{tenant.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tenant.role.toLowerCase()}
                        {suspended && " · suspendido"}
                      </span>
                    </span>

                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <form action="/auth/signout" method="post" className="mt-6 text-center">
          <button type="submit" className="text-xs text-muted-foreground hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
