import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acceder" };

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Mensaje genérico a propósito: distinguir "usuario no existe" de
  // "contraseña incorrecta" permite enumerar quién es cliente de Rukma Studio.
  if (error) redirect(`/login?error=invalid`);

  const { data: memberships } = await supabase
    .from("tenant_users")
    .select("tenant:tenants(slug)")
    .limit(1);

  const first = memberships?.[0]?.tenant as unknown as { slug: string } | undefined;
  redirect(next || (first ? `/${first.slug}` : "/switch"));
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Kontorōru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CMS de Rukma Studio
          </p>
        </div>

        <form action={signIn} className="space-y-3">
          <input type="hidden" name="next" value={next ?? ""} />

          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@empresa.com"
            className="h-9 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Contraseña"
            className="h-9 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />

          {error && (
            <p className="text-sm text-destructive">
              Credenciales incorrectas.
            </p>
          )}

          <Button type="submit" className="w-full">
            Acceder
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          El alta de cuentas la gestiona Rukma Studio por invitación.
        </p>
      </div>
    </main>
  );
}
