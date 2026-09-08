import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Quote, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";

export const metadata = { title: "Recuperar contraseña" };

async function sendResetLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });

  if (error) {
    redirect(`/recover?error=true`);
  }
  redirect(`/recover?success=true`);
}

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;

  return (
    <main className="flex lg:flex-row-reverse flex-col min-h-svh w-full bg-background">
      {/* Lado izquierdo - Formulario */}
      <div className="flex flex-1 items-center justify-center p-8 sm:p-12 relative">
        <Link href="/login" className="absolute top-8 left-8 sm:top-12 sm:left-12 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
          Volver al login
        </Link>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tu correo para recibir un enlace seguro.
            </p>
          </div>

          {success ? (
            <div className="rounded-[var(--radius)] border border-success/20 bg-success-surface p-4 text-sm text-success">
              Te hemos enviado un correo con instrucciones para restablecer tu contraseña. Por favor, revisa tu bandeja de entrada.
            </div>
          ) : (
            <form action={sendResetLink} className="space-y-4">
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

              {error && (
                <p className="text-sm font-medium text-destructive text-left">
                  Ocurrió un error al intentar enviar el correo. Por favor intenta de nuevo.
                </p>
              )}

              <Button type="submit" className="w-full h-10 mt-2">
                Enviar enlace
              </Button>
            </form>
          )}
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
              &quot;Recuperar el control nunca fue tan sencillo. Estás a un paso de volver a la experiencia sin ataduras.&quot;
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
