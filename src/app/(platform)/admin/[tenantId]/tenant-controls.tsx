"use client";

import { useActionState, useTransition } from "react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PLANS,
  TENANT_STATUSES,
  STATUS_LABELS,
  isOperational,
  type TenantStatus,
} from "@/lib/auth/plans";
import type { TenantLimits } from "@/lib/content/json";
import type { PlatformState } from "../actions";

export function TenantControls({
  tenantSlug,
  status,
  plan,
  limits,
  saveAction,
  statusAction,
}: {
  tenantSlug: string;
  status: TenantStatus;
  plan: keyof typeof PLANS;
  limits: TenantLimits;
  saveAction: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
  statusAction: (status: string) => Promise<void>;
}) {
  const [state, formAction, isSaving] = useActionState<PlatformState, FormData>(
    saveAction,
    {},
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-[var(--radius)] border bg-card p-4">
        <h2 className="font-medium">Estado del servicio</h2>

        <div className="flex flex-wrap gap-1.5">
          {TENANT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={Boolean(pending) || s === status}
              aria-pressed={s === status}
              onClick={() => {
                if (isOperational(status) && !isOperational(s)) {
                  const warning =
                    s === "CANCELLED"
                      ? "Cancelar cierra el acceso al panel y deja de servir la API. El contenido se conserva. ¿Continuar?"
                      : "Suspender corta el acceso del cliente de inmediato, incluida su API. ¿Continuar?";
                  if (!window.confirm(warning)) return;
                }
                startTransition(async () => {
                  await statusAction(s);
                });
              }}
              className={`rounded-[var(--radius)] border px-3 py-1.5 text-sm transition-colors disabled:opacity-100 ${
                s === status
                  ? "border-ring bg-accent font-medium text-accent-foreground"
                  : "hover:bg-accent disabled:opacity-50"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {isOperational(status)
            ? "El cliente puede entrar al panel y su API responde."
            : "El cliente ve una pantalla de espacio en pausa; su API deja de responder."}
        </p>

        <Button asChild variant="outline" size="sm">
          <Link href={`/${tenantSlug}`}>
            <ExternalLink className="size-3.5" />
            Abrir su panel
          </Link>
        </Button>
      </section>

      <form
        action={formAction}
        className="space-y-3 rounded-[var(--radius)] border bg-card p-4"
      >
        <h2 className="font-medium">Plan y límites</h2>

        <div className="space-y-1.5">
          <Label htmlFor="plan">Plan</Label>
          <select
            id="plan"
            name="plan"
            defaultValue={plan}
            className="h-9 w-full rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {Object.entries(PLANS).map(([value, p]) => (
              <option key={value} value={value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/*
          Los límites se editan aparte del plan a propósito: un cliente puede
          estar en PRO con el doble de almacenamiento negociado, sin obligar a
          inventar un plan nuevo para cada excepción comercial.
        */}
        <div className="grid grid-cols-2 gap-3">
          <LimitField id="maxUsers" label="Usuarios" value={limits.maxUsers} />
          <LimitField id="maxPosts" label="Entradas" value={limits.maxPosts} />
          <LimitField id="maxStorageMb" label="Almacenamiento (MB)" value={limits.maxStorageMb} />
          <LimitField id="maxApiKeys" label="API keys" value={limits.maxApiKeys} />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
          {state.ok && !isSaving && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" />
              {state.ok}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function LimitField({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} name={id} type="number" min={1} defaultValue={value} className="h-8" />
    </div>
  );
}
