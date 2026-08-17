"use client";

import { useState, useTransition } from "react";
import { Clock, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TenantRole } from "@/lib/auth/roles";
import type { PlatformState } from "../actions";

export type PlatformMember = {
  id: string;
  role: TenantRole;
  email: string;
  fullName: string | null;
  /** Invitado pero sin aceptar todavía: la cuenta aún no ha entrado nunca. */
  pending: boolean;
  suspended: boolean;
  joinedAt: string;
};

const ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  EDITOR: "Editor",
  CONTRIBUTOR: "Colaborador",
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/**
 * Gestión de colaboradores desde el panel de plataforma.
 *
 * A diferencia del listado del propio cliente, aquí sí se puede tocar a los
 * propietarios: la razón de existir de esta pantalla es justo el caso en que
 * el cliente no puede arreglarlo solo —el único OWNER perdió el acceso, o
 * alguien salió de la empresa sin traspasar nada.
 */
export function MemberList({
  members,
  maxUsers,
  roleAction,
  suspendAction,
  removeAction,
}: {
  members: PlatformMember[];
  maxUsers: number;
  roleAction: (memberId: string, role: string) => Promise<PlatformState>;
  suspendAction: (memberId: string, suspended: boolean) => Promise<PlatformState>;
  removeAction: (memberId: string) => Promise<PlatformState>;
}) {
  const [state, setState] = useState<PlatformState>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (memberId: string, action: () => Promise<PlatformState>) => {
    setBusyId(memberId);
    setState({});
    startTransition(async () => {
      setState(await action());
      setBusyId(null);
    });
  };

  const active = members.filter((m) => !m.suspended).length;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">
          Equipo{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({active} activos de {maxUsers}
            {active !== members.length && ` · ${members.length - active} en pausa`})
          </span>
        </h2>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>
        )}
      </div>

      <div className="divide-y rounded-[var(--radius)] border bg-card">
        {members.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Este espacio no tiene colaboradores.
          </p>
        )}

        {members.map((member) => {
          const busy = pending && busyId === member.id;

          return (
            <div
              key={member.id}
              className={`flex flex-wrap items-center gap-3 p-3 text-sm ${
                member.suspended ? "bg-muted/40" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`truncate font-medium ${member.suspended ? "text-muted-foreground line-through" : ""}`}>
                    {member.fullName ?? member.email}
                  </span>

                  {member.suspended && (
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <PauseCircle className="size-3" />
                      acceso en pausa
                    </span>
                  )}

                  {member.pending && (
                    <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                      <Clock className="size-3" />
                      invitación pendiente
                    </span>
                  )}
                </div>

                <p className="truncate text-xs text-muted-foreground">
                  {member.fullName && `${member.email} · `}
                  alta el{" "}
                  {new Date(member.joinedAt).toLocaleDateString("es-ES", DATE_FORMAT)}
                </p>
              </div>

              <select
                defaultValue={member.role}
                disabled={busy}
                aria-label={`Rol de ${member.email}`}
                onChange={(e) => run(member.id, () => roleAction(member.id, e.target.value))}
                className="h-8 rounded-[var(--radius)] border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={
                  member.suspended
                    ? `Restablecer el acceso de ${member.email}`
                    : `Pausar el acceso de ${member.email}`
                }
                onClick={() => {
                  // Pausar corta el acceso de golpe: la persona puede estar
                  // trabajando en este momento.
                  if (
                    !member.suspended &&
                    !window.confirm(
                      `${member.email} dejará de entrar a este espacio hasta que lo restablezcas. ¿Continuar?`,
                    )
                  ) {
                    return;
                  }
                  run(member.id, () => suspendAction(member.id, !member.suspended));
                }}
              >
                {member.suspended ? (
                  <>
                    <PlayCircle className="size-3.5" />
                    Restablecer
                  </>
                ) : (
                  <>
                    <PauseCircle className="size-3.5" />
                    Pausar
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Eliminar a ${member.email} del espacio`}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Se elimina a ${member.email} de este espacio. Su cuenta y su trabajo se conservan, pero pierde el acceso y habrá que volver a invitarle. ¿Continuar?`,
                    )
                  ) {
                    return;
                  }
                  run(member.id, () => removeAction(member.id));
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
