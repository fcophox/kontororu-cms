"use client";

import { useActionState, useState } from "react";
import { Plus, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLANS } from "@/lib/auth/plans";
import { slugify } from "@/lib/content/slug";
import type { PlatformState } from "./actions";

export function NewTenantForm({
  createAction,
}: {
  createAction: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
}) {
  const [state, formAction, isCreating] = useActionState<PlatformState, FormData>(
    createAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // El identificador se deriva del nombre hasta que alguien lo edita a mano:
  // así el caso normal es un solo campo, y sigue siendo corregible.
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <section className="rounded-[var(--radius)] border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-4 text-left font-medium"
      >
        <Plus className="size-4" />
        Dar de alta un cliente
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <form action={formAction} className="space-y-4 border-t p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre del cliente</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ACME Corporation"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">Identificador</Label>
              <Input
                id="slug"
                name="slug"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="acme"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Su URL: /{effectiveSlug || "identificador"} — no se puede cambiar después.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ownerEmail">Email del propietario</Label>
              <Input
                id="ownerEmail"
                name="ownerEmail"
                type="email"
                required
                placeholder="responsable@acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Recibirá una invitación con acceso de propietario.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                name="plan"
                defaultValue="PRO"
                className="h-9 w-full rounded-[var(--radius)] border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {Object.entries(PLANS).map(([value, plan]) => (
                  <option key={value} value={value}>
                    {plan.label} — {plan.limits.maxPosts} entradas ·{" "}
                    {plan.limits.maxUsers} usuarios
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Se crea en estado de prueba; los límites se ajustan después.
              </p>
            </div>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" disabled={isCreating}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Crear espacio e invitar
          </Button>
        </form>
      )}
    </section>
  );
}
