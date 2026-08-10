"use client";

import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Check, Upload, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brandingToCssVars,
  serializeCssVars,
  type TenantBranding,
} from "@/lib/theme/branding";
import { contrastRatio, hexToRgb } from "@/lib/theme/color";
import type { BrandingState } from "./actions";

const RADIUS_OPTIONS = [
  { value: "0rem", label: "Recto" },
  { value: "0.375rem", label: "Suave" },
  { value: "0.625rem", label: "Medio" },
  { value: "1rem", label: "Redondeado" },
];

export function BrandingForm({
  tenantId,
  tenantName,
  initial,
  saveAction,
}: {
  tenantId: string;
  tenantName: string;
  initial: TenantBranding;
  saveAction: (prev: BrandingState, formData: FormData) => Promise<BrandingState>;
}) {
  const [state, formAction, isSaving] = useActionState<BrandingState, FormData>(
    saveAction,
    {},
  );

  const [draft, setDraft] = useState<TenantBranding>(initial);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);

  const set = <K extends keyof TenantBranding>(key: K, value: TenantBranding[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Previsualización en vivo: se escriben las variables sobre el scope que
  // ya inyectó el servidor, así el dashboard entero cambia mientras se mueve
  // el selector. Al guardar, el render de servidor toma el relevo.
  useEffect(() => {
    const scope = document.getElementById("tenant-scope");
    if (!scope) return;

    const vars = brandingToCssVars(draft);
    Object.entries(vars).forEach(([k, v]) => scope.style.setProperty(k, v));

    return () => {
      Object.keys(vars).forEach((k) => scope.style.removeProperty(k));
    };
  }, [draft]);

  const computed = brandingToCssVars(draft);
  const appliedPrimary = computed["--primary"];
  const wasAdjusted = appliedPrimary.toLowerCase() !== draft.primary.toLowerCase();
  const ratio = contrastRatio(
    hexToRgb(appliedPrimary),
    hexToRgb(computed["--primary-foreground"]),
  );

  const uploadLogo = async (file: File) => {
    setLogoError(null);
    setIsUploadingLogo(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("tenantId", tenantId);
      const res = await fetch("/api/media/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al subir");
      set("logoUrl", json.url);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const uploadFavicon = async (file: File) => {
    setFaviconError(null);
    setIsUploadingFavicon(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("tenantId", tenantId);
      const res = await fetch("/api/media/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al subir");
      set("faviconUrl", json.url);
    } catch (err) {
      setFaviconError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[22rem_1fr]">
      <input type="hidden" name="primary" value={draft.primary} />
      <input type="hidden" name="secondary" value={draft.secondary} />
      <input type="hidden" name="radius" value={draft.radius} />
      <input type="hidden" name="logoUrl" value={draft.logoUrl ?? ""} />
      <input type="hidden" name="faviconUrl" value={draft.faviconUrl ?? ""} />

      <div className="space-y-6">
        <section className="space-y-2">
          <Label>Logotipo</Label>
          <div className="flex items-center gap-3">
            <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border bg-muted">
              {draft.logoUrl ? (
                <Image src={draft.logoUrl} alt="" fill unoptimized className="object-contain p-1" />
              ) : (
                <span className="text-xs text-muted-foreground">Sin logo</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border px-3 text-sm hover:bg-accent">
                  {isUploadingLogo ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Subir
                </span>
              </label>

              {draft.logoUrl && (
                <button
                  type="button"
                  onClick={() => set("logoUrl", null)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                  Quitar
                </button>
              )}
            </div>
          </div>
          {logoError && <p className="text-sm text-destructive">{logoError}</p>}
          <p className="text-xs text-muted-foreground">PNG, SVG o WebP. Se muestra a 28 px.</p>
        </section>

        <section className="space-y-2">
          <Label>Favicon</Label>
          <div className="flex items-center gap-3">
            <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border bg-muted">
              {draft.faviconUrl ? (
                <Image src={draft.faviconUrl} alt="" fill unoptimized className="object-contain p-2" />
              ) : (
                <span className="text-xs text-muted-foreground">Sin favicon</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/x-icon,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFavicon(file);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border px-3 text-sm hover:bg-accent">
                  {isUploadingFavicon ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Subir
                </span>
              </label>

              {draft.faviconUrl && (
                <button
                  type="button"
                  onClick={() => set("faviconUrl", null)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                  Quitar
                </button>
              )}
            </div>
          </div>
          {faviconError && <p className="text-sm text-destructive">{faviconError}</p>}
          <p className="text-xs text-muted-foreground">PNG, ICO, SVG o WebP. Se muestra en la pestaña del navegador.</p>
        </section>

        <ColorField
          id="primary"
          label="Color principal"
          hint="Botones, enlaces y estados activos."
          value={draft.primary}
          onChange={(v) => set("primary", v)}
        />

        <ColorField
          id="secondary"
          label="Color secundario"
          hint="Fondos suaves y acentos."
          value={draft.secondary}
          onChange={(v) => set("secondary", v)}
        />

        <section className="space-y-2">
          <Label>Esquinas</Label>
          <div className="flex gap-1.5">
            {RADIUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("radius", o.value)}
                aria-pressed={draft.radius === o.value}
                className={`flex-1 border px-2 py-1.5 text-xs transition-colors ${
                  draft.radius === o.value
                    ? "border-ring bg-accent text-accent-foreground"
                    : "hover:bg-accent"
                }`}
                style={{ borderRadius: o.value === "0rem" ? "0" : o.value }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        {/*
          El ajuste de contraste es invisible si no se explica: el cliente
          elige un color y ve otro ligeramente distinto en los botones.
          Decirlo evita el ticket de soporte "no me guarda mi color".
        */}
        {wasAdjusted && (
          <div className="flex gap-2 rounded-[var(--radius)] border bg-muted/50 p-3 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="space-y-1.5">
              <p className="text-muted-foreground">
                Sobre los botones se aplica un tono ligeramente ajustado de tu
                color para que el texto encima siga siendo legible (contraste{" "}
                {ratio.toFixed(1)}:1, mínimo 4.5 según WCAG AA).
              </p>
              <div className="flex items-center gap-2">
                <Swatch hex={draft.primary} label="tuyo" />
                <span className="text-muted-foreground">→</span>
                <Swatch hex={appliedPrimary} label="aplicado" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Guardar marca
          </Button>
          {state.ok && !isSaving && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" />
              Guardado
            </span>
          )}
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        </div>
      </div>

      <BrandingPreview branding={draft} tenantName={tenantName} />
    </form>
  );
}

const HEX_COMPLETE = /^#([a-f\d]{3}|[a-f\d]{6})$/i;

/**
 * Selector de color + campo hexadecimal.
 *
 * El campo de texto tiene su propio estado (`text`) separado del color
 * confirmado (`value`). Hace falta porque escribir "#e11d48" pasa por
 * "#e", "#e1", "#e11"… que no son colores válidos: si el input estuviera
 * atado directamente a `value`, no se podría teclear. Sólo se confirma
 * cuando el hex está completo.
 */
function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const isValid = HEX_COMPLETE.test(text);

  const commit = (next: string) => {
    setText(next);
    onChange(next);
  };

  return (
    <section className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => commit(e.target.value.toLowerCase())}
          className="size-9 shrink-0 cursor-pointer rounded-[var(--radius)] border bg-background p-1"
          aria-label={`${label}: selector visual`}
        />
        <Input
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            const next = raw.startsWith("#") || raw === "" ? raw : `#${raw}`;
            setText(next);
            if (HEX_COMPLETE.test(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => {
            // Al salir con el hex a medias se recupera el último válido, en
            // vez de dejar el campo mostrando algo que no es el color real.
            if (!HEX_COMPLETE.test(text)) setText(value);
          }}
          spellCheck={false}
          aria-invalid={!isValid}
          className="font-mono"
          aria-label={`${label} en hexadecimal`}
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-4 rounded border"
        style={{ background: hex }}
        aria-hidden
      />
      <span className="font-mono text-[11px] text-muted-foreground">
        {hex} <span className="font-sans">({label})</span>
      </span>
    </span>
  );
}

/**
 * Miniatura del dashboard con la marca aplicada. Usa un scope propio para
 * poder mostrar el resultado aunque el usuario aún no haya guardado.
 */
function BrandingPreview({
  branding,
  tenantName,
}: {
  branding: TenantBranding;
  tenantName: string;
}) {
  const style = serializeCssVars(brandingToCssVars(branding));

  return (
    <div className="h-fit space-y-3">
      <p className="text-sm font-medium">Vista previa</p>

      {/*
        Scope propio para la miniatura: permite ver el resultado antes de
        guardar, sin depender del scope que inyectó el servidor.
      */}
      <style dangerouslySetInnerHTML={{ __html: `#branding-preview{${style}}` }} />
      <div id="branding-preview" className="overflow-hidden rounded-[var(--radius)] border">
        <div className="flex items-center gap-2 border-b bg-sidebar px-3 py-2.5">
          <span
            className="grid size-6 place-items-center rounded text-[10px] font-semibold"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {tenantName.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-sm font-medium">{tenantName}</span>
        </div>

        <div className="space-y-3 p-4">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="flex gap-2">
            <span
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              Publicar
            </span>
            <span
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm"
              style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
            >
              Guardar
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Los grises, la tipografía y el espaciado los define Rukma Studio: así una
        mejora de la interfaz llega a todos los clientes sin romper ninguna marca.
      </p>
    </div>
  );
}
