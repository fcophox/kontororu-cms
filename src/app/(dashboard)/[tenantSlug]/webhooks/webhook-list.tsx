"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Loader2, RotateCw, Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_DEFAULT_EVENTS,
} from "@/lib/content/webhook-events";
import type { WebhookState } from "./actions";

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
};

export type DeliveryRow = {
  id: string;
  event: string;
  attempt: number;
  statusCode: number | null;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

type WebhookAction = (prev: WebhookState, formData: FormData) => Promise<WebhookState>;

export function WebhookList({
  webhooks,
  deliveries,
  createAction,
  updateAction,
  toggleAction,
  deleteAction,
  retryAction,
}: {
  webhooks: WebhookRow[];
  deliveries: DeliveryRow[];
  createAction: WebhookAction;
  updateAction: WebhookAction;
  toggleAction: (id: string, isActive: boolean) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  retryAction: (deliveryId: string) => Promise<void>;
}) {
  const [state, formAction, isCreating] = useActionState<WebhookState, FormData>(
    createAction,
    {},
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-medium">Endpoints</h2>
          <div className="divide-y rounded-[var(--radius)] border bg-card">
            {webhooks.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Sin webhooks. Añade uno para que tu web se regenere al publicar.
              </p>
            )}

            {webhooks.map((hook) => (
              <WebhookRowItem
                key={hook.id}
                hook={hook}
                updateAction={updateAction}
                toggleAction={toggleAction}
                deleteAction={deleteAction}
                pending={Boolean(pending)}
                startTransition={startTransition}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">Entregas recientes</h2>
          <div className="divide-y rounded-[var(--radius)] border bg-card">
            {deliveries.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Todavía no se ha enviado nada. Publica un contenido para probar.
              </p>
            )}

            {deliveries.map((d) => {
              const ok = d.deliveredAt !== null;
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 text-sm">
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      ok ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    aria-label={ok ? "Entregado" : "Fallido"}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="truncate">{label(d.event)}</span>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(d.createdAt)}
                      {d.statusCode ? ` · HTTP ${d.statusCode}` : ""}
                      {d.attempt > 1 ? ` · ${d.attempt} intentos` : ""}
                      {d.error ? ` · ${d.error}` : ""}
                    </p>
                  </div>

                  {!ok && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(pending)}
                      onClick={() =>
                        startTransition(async () => {
                          await retryAction(d.id);
                        })
                      }
                    >
                      <RotateCw className="size-4" />
                      Reintentar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Los fallos se reintentan solos con espera creciente: 1, 2, 4, 8, 16 y
            32 minutos.
          </p>
        </section>
      </div>

      <form
        action={formAction}
        className="h-fit space-y-3 rounded-[var(--radius)] border bg-card p-4"
      >
        <h2 className="font-medium">Nuevo webhook</h2>

        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" required maxLength={60} placeholder="Revalidar web" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="url">Endpoint</Label>
          <Input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://tuweb.com/api/revalidate"
          />
          <p className="text-xs text-muted-foreground">Sólo HTTPS y dominios públicos.</p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm leading-none font-medium">Eventos</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="events"
                value={event}
                defaultChecked={WEBHOOK_DEFAULT_EVENTS.includes(event)}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              {label(event)}
            </label>
          ))}
        </fieldset>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>}

        <Button type="submit" className="w-full" disabled={isCreating}>
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Crear webhook
        </Button>
      </form>
    </div>
  );
}

/**
 * Una fila del listado, con su propio modo edición.
 *
 * Vive en su propio componente porque cada fila necesita su `useActionState`:
 * compartir uno solo haría que el error de guardar un webhook apareciera bajo
 * todos los demás.
 */
function WebhookRowItem({
  hook,
  updateAction,
  toggleAction,
  deleteAction,
  pending,
  startTransition,
}: {
  hook: WebhookRow;
  updateAction: WebhookAction;
  toggleAction: (id: string, isActive: boolean) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [state, formAction, isSaving] = useActionState<WebhookState, FormData>(updateAction, {});

  // Al guardar con éxito se cierra el formulario. El `ok` sólo llega cuando el
  // servidor ya revalidó, así que la fila de debajo muestra el valor nuevo.
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  if (editing) {
    return (
      <form action={formAction} className="space-y-3 bg-muted/30 p-4">
        <input type="hidden" name="id" value={hook.id} />

        <div className="space-y-1.5">
          <Label htmlFor={`name-${hook.id}`}>Nombre</Label>
          <Input
            id={`name-${hook.id}`}
            name="name"
            required
            maxLength={60}
            defaultValue={hook.name}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`url-${hook.id}`}>Endpoint</Label>
          <Input
            id={`url-${hook.id}`}
            name="url"
            type="url"
            required
            defaultValue={hook.url}
          />
          <p className="text-xs text-muted-foreground">Sólo HTTPS y dominios públicos.</p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm leading-none font-medium">Eventos</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="events"
                value={event}
                defaultChecked={hook.events.includes(event)}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              {label(event)}
            </label>
          ))}
        </fieldset>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isSaving}
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{hook.name}</span>
            {!hook.isActive && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                pausado
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">{hook.url}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hook.events.map((e) => label(e)).join(" · ")}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hook.isActive}
            disabled={pending}
            className="size-4 accent-[var(--primary)]"
            onChange={(e) =>
              startTransition(async () => {
                await toggleAction(hook.id, e.target.checked);
              })
            }
          />
          Activo
        </label>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Editar ${hook.name}`}
          disabled={pending}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Eliminar ${hook.name}`}
          disabled={pending}
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <SecretField secret={hook.secret} />

      <ConfirmDialog
        isOpen={confirmingDelete}
        title={`¿Eliminar el webhook "${hook.name}"?`}
        description="Dejarás de recibir estos eventos en tu web. El historial de entregas se va con él."
        confirmText="Eliminar"
        onConfirm={async () => {
          await deleteAction(hook.id);
          setConfirmingDelete(false);
        }}
        onCancel={() => setConfirmingDelete(false)}
        variant="destructive"
        icon={Trash2}
      />
    </div>
  );
}

/**
 * El secreto sí puede volver a mostrarse — a diferencia de una API key, aquí
 * ambos extremos necesitan el mismo valor para calcular el HMAC, así que se
 * guarda en claro. Se oculta por defecto para que no aparezca en una captura
 * o al compartir pantalla.
 */
function SecretField({ secret }: { secret: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius)] bg-muted/50 px-2 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">Secreto</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs">
        {visible ? secret : "•".repeat(24)}
      </code>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar secreto" : "Mostrar secreto"}
        className="text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button
        type="button"
        aria-label="Copiar secreto"
        className="text-muted-foreground hover:text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(secret);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** Etiqueta legible; cae al identificador si Postgres añade un evento nuevo. */
function label(event: string): string {
  return WEBHOOK_EVENT_LABELS[event as keyof typeof WEBHOOK_EVENT_LABELS] ?? event;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
