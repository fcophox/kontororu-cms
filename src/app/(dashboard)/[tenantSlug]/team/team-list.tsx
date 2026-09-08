"use client";

import { useActionState, useState, useTransition } from "react";
import { UserPlus, Trash2, Loader2, Clock, PauseCircle, KeyRound, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { atLeast } from "@/lib/auth/roles";
import type { TenantRole } from "@/lib/auth/roles";
import type { TeamState } from "./actions";

type Member = {
  id: string;
  role: TenantRole;
  email: string;
  fullName: string | null;
  isSelf: boolean;
  pending: boolean;
  suspended: boolean;
};

const ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  EDITOR: "Editor",
  CONTRIBUTOR: "Colaborador",
};

const ROLE_HINTS: Record<TenantRole, string> = {
  OWNER: "Control total, incluida la facturación.",
  ADMIN: "Configura marca, equipo, API keys y webhooks.",
  EDITOR: "Crea, edita y publica todo el contenido.",
  CONTRIBUTOR: "Sólo redacta sus propios borradores.",
};

/**
 * Contraseña sugerida para el alta directa.
 *
 * `crypto.getRandomValues` y no `Math.random()`: esto acaba siendo la
 * credencial real de una cuenta, aunque se cambie al primer acceso.
 */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

export function TeamList({
  members,
  actorRole,
  atLimit,
  canCreateDirectly,
  addAction,
  changeRoleAction,
  removeAction,
}: {
  members: Member[];
  actorRole: TenantRole;
  atLimit: boolean;
  /** El alta directa con contraseña la reserva Rukma Studio. */
  canCreateDirectly: boolean;
  addAction: (prev: TeamState, formData: FormData) => Promise<TeamState>;
  changeRoleAction: (memberId: string, role: TenantRole) => Promise<void>;
  removeAction: (memberId: string) => Promise<void>;
}) {
  const [state, formAction, isSubmitting] = useActionState<TeamState, FormData>(
    addAction,
    {},
  );
  const [pending, startTransition] = useTransition();
  // El miembro a expulsar, no un booleano: el diálogo se monta fuera de la
  // lista y necesita su email para decir a quién se está quitando.
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [password, setPassword] = useState("");

  // Sólo se ofrecen roles iguales o inferiores al propio. El servidor lo
  // vuelve a comprobar: esto evita ofrecer una opción que va a fallar.
  const assignable = (["ADMIN", "EDITOR", "CONTRIBUTOR"] as const).filter((r) =>
    atLeast(actorRole, r),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {members.map((member) => {
          const canManage = !member.isSelf && atLeast(actorRole, member.role);

          return (
            <div key={member.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {member.fullName ?? member.email}
                  </span>
                  {member.isSelf && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                      tú
                    </span>
                  )}
                  {member.pending && (
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <Clock className="size-3" />
                      invitación pendiente
                    </span>
                  )}
                  {member.suspended && (
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <PauseCircle className="size-3" />
                      acceso en pausa
                    </span>
                  )}
                </div>
                {member.fullName && (
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                )}
              </div>

              {canManage && member.role !== "OWNER" ? (
                <select
                  defaultValue={member.role}
                  disabled={Boolean(pending)}
                  aria-label={`Rol de ${member.email}`}
                  onChange={(e) =>
                    startTransition(async () => {
                      await changeRoleAction(member.id, e.target.value as TenantRole);
                    })
                  }
                  className="h-8 rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-[size:16px_auto] bg-no-repeat pr-8"
                >
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {ROLE_LABELS[member.role]}
                </span>
              )}

              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Expulsar a ${member.email}`}
                  disabled={Boolean(pending)}
                  onClick={() => setToRemove(member)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <form
        action={formAction}
        className="h-fit space-y-3 rounded-[var(--radius)] border bg-card p-4"
      >
        <h2 className="font-medium">Añadir colaborador</h2>

        {/* El modo va en el formulario, no en dos formularios distintos: el
            email y el rol son los mismos y duplicarlos invitaba a que se
            desincronizaran. */}
        <input type="hidden" name="mode" value={canCreateDirectly ? mode : "invite"} />
        {canCreateDirectly && (
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-muted p-1">
          {(
            [
              ["invite", "Invitar", Mail],
              ["direct", "Alta directa", KeyRound],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`flex items-center justify-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-xs font-medium transition-colors ${
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        )}

        <p className="text-xs text-muted-foreground">
          {!canCreateDirectly || mode === "invite"
            ? "Recibe un correo y elige su propia contraseña al entrar."
            : "La cuenta queda creada y confirmada al momento, sin correo de verificación. Entrega la contraseña por un canal seguro y pídele que la cambie en Configuración → Perfil."}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="persona@empresa.com" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nombre (opcional)</Label>
          <Input id="fullName" name="fullName" type="text" placeholder="Nombre y apellidos" />
        </div>

        {canCreateDirectly && mode === "direct" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
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
              id="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="role">Rol</Label>
          <select
            id="role"
            name="role"
            defaultValue="EDITOR"
            className="h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-xs font-medium outline-hidden hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-[size:16px_auto] bg-no-repeat pr-8"
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} — {ROLE_HINTS[r]}
              </option>
            ))}
          </select>
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>}

        {atLimit ? (
          <p className="text-sm text-muted-foreground">
            Has alcanzado el límite de colaboradores de tu plan.
          </p>
        ) : (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : canCreateDirectly && mode === "direct" ? (
              <KeyRound className="size-4" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {canCreateDirectly && mode === "direct"
              ? "Crear cuenta y añadir"
              : "Enviar invitación"}
          </Button>
        )}
      </form>

      <ConfirmDialog
        isOpen={toRemove !== null}
        title="¿Quitar a este colaborador?"
        description={`${toRemove?.email ?? ""} perderá el acceso a este espacio. El contenido que haya creado se queda.`}
        confirmText="Quitar"
        onConfirm={async () => {
          if (toRemove) await removeAction(toRemove.id);
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
        variant="destructive"
        icon={Trash2}
      />
    </div>
  );
}
