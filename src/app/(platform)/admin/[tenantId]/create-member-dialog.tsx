"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { TenantRole } from "@/lib/auth/roles";
import type { PlatformState } from "../actions";

const ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  EDITOR: "Editor",
  CONTRIBUTOR: "Colaborador",
};

/**
 * Contraseña sugerida.
 *
 * `crypto.getRandomValues` y no `Math.random()`: esto acaba siendo la
 * credencial real de una cuenta, aunque se cambie al primer acceso. El
 * alfabeto excluye `l/I/1` y `O/0` porque estas contraseñas se dictan y se
 * copian a mano más veces de las que nos gustaría.
 */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(values, (n) => alphabet[n % alphabet.length]).join("");
}

/**
 * Alta directa de un colaborador, sin correo de verificación.
 *
 * Sólo se monta para SuperAdmin: la página ya no lo renderiza para nadie más
 * y la Server Action lo vuelve a comprobar, que es la barrera real.
 */
export function CreateMemberDialog({
  action,
}: {
  action: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, isPending] = useActionState<PlatformState, FormData>(
    action,
    {},
  );

  useEffect(() => setMounted(true), []);

  // Cerrar en cuanto sale bien sería un error: la contraseña que acaba de
  // fijarse sólo existe en esta pantalla y hay que poder copiarla.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, isPending]);

  const trigger = (
    <Button type="button" size="sm" onClick={() => setOpen(true)}>
      <UserPlus className="size-3.5" />
      Añadir colaborador
    </Button>
  );

  if (!open || !mounted) return trigger;

  return (
    <>
      {trigger}
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-xs animate-backdrop-in"
            onClick={() => {
              if (!isPending) setOpen(false);
            }}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-member-title"
            className="relative w-full max-w-[440px] overflow-hidden rounded-[var(--radius)] border border-border bg-card p-6 shadow-lg animate-modal-in"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              aria-label="Cerrar"
              className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary dark:bg-primary/20">
                <KeyRound className="size-5" />
              </div>
              <div className="space-y-1.5">
                <h3
                  id="create-member-title"
                  className="text-base font-semibold leading-none tracking-tight"
                >
                  Añadir colaborador
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  La cuenta se crea confirmada, sin correo de verificación: puede
                  entrar al momento con la contraseña que definas.
                </p>
              </div>
            </div>

            <form action={formAction} className="mt-5 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="persona@empresa.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-name">Nombre (opcional)</Label>
                <Input
                  id="member-name"
                  name="fullName"
                  type="text"
                  placeholder="Nombre y apellidos"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="member-password">Contraseña</Label>
                  <button
                    type="button"
                    onClick={() => setPassword(suggestPassword())}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RefreshCw className="size-3" />
                    Generar
                  </button>
                </div>
                <PasswordInput
                  id="member-password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-role">Rol</Label>
                <select
                  id="member-role"
                  name="role"
                  defaultValue="EDITOR"
                  className="h-9 w-full rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-muted-foreground">
                Entrega la contraseña por un canal seguro y pídele que la cambie en
                Configuración → Perfil al primer acceso.
              </p>

              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              {state.ok && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  {state.ok ? "Cerrar" : "Cancelar"}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Crear y añadir
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
