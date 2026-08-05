"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Plus, Loader2, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiKeyState } from "./actions";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

const SCOPE_LABELS: Record<string, string> = {
  "content:read": "Leer contenido",
  "media:read": "Leer medios",
};

export function ApiKeyList({
  keys,
  atLimit,
  createAction,
  revokeAction,
}: {
  keys: ApiKeyRow[];
  atLimit: boolean;
  createAction: (prev: ApiKeyState, formData: FormData) => Promise<ApiKeyState>;
  revokeAction: (keyId: string) => Promise<void>;
}) {
  const [state, formAction, isCreating] = useActionState<ApiKeyState, FormData>(
    createAction,
    {},
  );
  const [pending, startTransition] = useTransition();

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-8">
      {/*
        La clave en claro sólo existe en esta respuesta: en la base hay un
        hash bcrypt. Si el usuario recarga sin copiarla, la única salida es
        revocarla y crear otra — por eso el aviso es tan explícito.
      */}
      {state.plainKey && <NewKeyBanner plainKey={state.plainKey} />}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-medium">Claves activas</h2>
            <div className="divide-y rounded-[var(--radius)] border bg-card">
              {active.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Ninguna clave activa. Crea una para que tu web consuma la API.
                </p>
              )}

              {active.map((key) => (
                <div key={key.id} className="flex items-center gap-4 p-4">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{key.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}…
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {key.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(" · ")}
                      {" — "}
                      {key.lastUsedAt
                        ? `usada por última vez el ${formatDate(key.lastUsedAt)}`
                        : "nunca usada"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Revocar "${key.name}" cortará el acceso de inmediato a cualquier web que la use. ¿Continuar?`,
                        )
                      )
                        return;
                      startTransition(async () => {
                        await revokeAction(key.id);
                      });
                    }}
                  >
                    Revocar
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {revoked.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Revocadas
              </h2>
              <div className="divide-y rounded-[var(--radius)] border bg-card/50">
                {revoked.map((key) => (
                  <div key={key.id} className="flex items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">
                      {key.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(key.revokedAt!)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Se conservan para poder auditar qué clave se usó y cuándo.
              </p>
            </section>
          )}
        </div>

        <form
          action={formAction}
          className="h-fit space-y-3 rounded-[var(--radius)] border bg-card p-4"
        >
          <h2 className="font-medium">Nueva clave</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required maxLength={60} placeholder="Web corporativa" />
            <p className="text-xs text-muted-foreground">
              Para saber cuál revocar si algo va mal.
            </p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm leading-none font-medium">Permisos</legend>
            {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked={scope === "content:read"}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                {label}
              </label>
            ))}
          </fieldset>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {atLimit ? (
            <p className="text-sm text-muted-foreground">
              Has alcanzado el límite de claves activas de tu plan.
            </p>
          ) : (
            <Button type="submit" className="w-full" disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Crear clave
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function NewKeyBanner({ plainKey }: { plainKey: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Copia la clave ahora</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Es la única vez que se muestra. Guardamos sólo un hash, así que no
            podemos volver a enseñártela: si la pierdes, tendrás que revocarla y
            crear otra.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-background px-2 py-1.5 font-mono text-xs whitespace-nowrap">
              {plainKey}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(plainKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiada" : "Copiar"}
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Úsala como cabecera:{" "}
            <code className="rounded bg-muted px-1">Authorization: Bearer …</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
