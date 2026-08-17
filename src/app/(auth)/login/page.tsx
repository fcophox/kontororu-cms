import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Quote } from "lucide-react";

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
    <main className="flex min-h-svh w-full bg-background">
      {/* Lado izquierdo - Login */}
      <div className="flex flex-1 items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight">Acceder a tu cuenta</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          <form action={signIn} className="space-y-4">
            <input type="hidden" name="next" value={next ?? ""} />

            <div className="space-y-1.5 text-left">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Correo electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@empresa.com"
                className="h-10 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-foreground">Contraseña</label>
                <Link href="/recover" className="text-sm text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive text-left">
                Credenciales incorrectas.
              </p>
            )}

            <Button type="submit" className="w-full h-10 mt-2">
              Acceder
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            El alta de cuentas la gestiona Rukma Studio por invitación.
          </p>
        </div>
      </div>

      {/* Lado derecho - Branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between bg-zinc-950 p-12 text-zinc-50 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">Kontorōru</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <Quote className="size-10 text-zinc-700 mb-6 rotate-180" />
          <blockquote className="space-y-6">
            <p className="text-3xl font-medium leading-snug">
              &quot;Kontorōru nace de nuestra visión por devolverte el control absoluto de tus contenidos. Una experiencia sin ataduras, diseñada a medida.&quot;
            </p>
            <footer className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-50">Equipo de Rukma Studio</span>
                <span className="text-sm text-zinc-400">Creadores de Kontorōru</span>
              </div>
            </footer>
          </blockquote>
        </div>
      </div>
    </main>
  );
}
