import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Quote } from "lucide-react";

export const metadata = { title: "Actualizar contraseña" };

async function updatePasswordAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 6 || password !== confirm) {
    redirect(`/update-password?error=true`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/update-password?error=true`);
  }
  
  redirect("/switch");
}

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  
  if (!data.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-svh w-full bg-background">
      <div className="flex flex-1 items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight">Crea una nueva contraseña</h1>
            <p className="text-sm text-muted-foreground">
              Establece una nueva clave segura para tu cuenta.
            </p>
          </div>

          <form action={updatePasswordAction} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Nueva contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="h-10 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            
            <div className="space-y-1.5 text-left">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirmar contraseña</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder="••••••••"
                className="h-10 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive text-left">
                Las contraseñas no coinciden o son muy cortas (mínimo 6 caracteres).
              </p>
            )}

            <Button type="submit" className="w-full h-10 mt-2">
              Guardar y entrar
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex w-1/2 flex-col justify-between bg-zinc-950 p-12 text-zinc-50 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">Kontorōru</span>
        </div>
        <div className="relative z-10 max-w-lg">
          <Quote className="size-10 text-zinc-700 mb-6 rotate-180" />
          <blockquote className="space-y-6">
            <p className="text-3xl font-medium leading-snug">
              "Bienvenido de nuevo. Tu seguridad es nuestra prioridad para mantener tu control absoluto."
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
