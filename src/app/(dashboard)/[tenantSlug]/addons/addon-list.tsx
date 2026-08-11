"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Loader2, Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findAddon } from "@/lib/addons/catalog";

export type AddonCard = {
  key: string;
  name: string;
  summary: string;
  description: string;
  priceLabel: string;
  actionLabel: string;
  /** `null` mientras el complemento no tenga pantalla propia. */
  configHref: string | null;
  isEnabled: boolean;
};

export function AddonList({
  addons,
  toggleAction,
}: {
  addons: AddonCard[];
  toggleAction: (key: string, enabled: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  // Qué tarjeta está esperando: sin esto, pulsar en una pone en marcha el
  // spinner de todas.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {addons.map((addon) => {
        const Icon = findAddon(addon.key)?.icon ?? Settings2;
        const isBusy = pending && busyKey === addon.key;

        return (
          <article
            key={addon.key}
            className="flex flex-col rounded-[var(--radius)] border bg-card p-5"
          >
            <div className="flex items-start gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] border"
                style={{ background: "var(--muted)" }}
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                {/* Los distintivos envuelven en vez de comprimir el título: en
                    dos columnas estrechas, `truncate` dejaba "Cale…". */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="font-medium">{addon.name}</h2>
                  {addon.isEnabled && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                      <Check className="size-3" />
                      activo
                    </span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {addon.priceLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{addon.summary}</p>
              </div>
            </div>

            <p className="mt-3 flex-1 text-sm text-muted-foreground">{addon.description}</p>

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant={addon.isEnabled ? "outline" : "default"}
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setBusyKey(addon.key);
                  startTransition(async () => {
                    await toggleAction(addon.key, !addon.isEnabled);
                    setBusyKey(null);
                  });
                }}
              >
                {isBusy && <Loader2 className="size-4 animate-spin" />}
                {addon.isEnabled ? "Desactivar" : "Activar"}
              </Button>

              {addon.isEnabled && addon.configHref && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={addon.configHref}>
                    <Settings2 className="size-4" />
                    {addon.actionLabel}
                  </Link>
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
