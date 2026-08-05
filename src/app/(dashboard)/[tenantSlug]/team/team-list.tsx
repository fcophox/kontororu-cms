"use client";

import { useActionState, useTransition } from "react";
import { UserPlus, Trash2, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function TeamList({
  members,
  actorRole,
  atLimit,
  inviteAction,
  changeRoleAction,
  removeAction,
}: {
  members: Member[];
  actorRole: TenantRole;
  atLimit: boolean;
  inviteAction: (prev: TeamState, formData: FormData) => Promise<TeamState>;
  changeRoleAction: (memberId: string, role: TenantRole) => Promise<void>;
  removeAction: (memberId: string) => Promise<void>;
}) {
  const [state, formAction, isInviting] = useActionState<TeamState, FormData>(
    inviteAction,
    {},
  );
  const [pending, startTransition] = useTransition();

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
                  className="h-8 rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                  onClick={() => {
                    if (!window.confirm(`¿Quitar a ${member.email} de este espacio?`)) return;
                    startTransition(async () => {
                      await removeAction(member.id);
                    });
                  }}
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
        <h2 className="font-medium">Invitar colaborador</h2>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="persona@empresa.com" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role">Rol</Label>
          <select
            id="role"
            name="role"
            defaultValue="EDITOR"
            className="h-9 w-full rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          <Button type="submit" className="w-full" disabled={isInviting}>
            {isInviting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Enviar invitación
          </Button>
        )}
      </form>
    </div>
  );
}
