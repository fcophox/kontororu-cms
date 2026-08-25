"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { AlertCircle, Languages, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { localeLabel } from "@/lib/content/locales";

export type Translation = {
  id: string;
  locale: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

/**
 * Traducciones de este contenido.
 *
 * Cada idioma es un contenido completo con su URL, su SEO y su estado, así
 * que se navega a él en lugar de editarlo aquí: intentar mostrar dos idiomas
 * a la vez en un mismo editor obliga a decidir qué significa "guardar".
 */
export function PostTranslations({
  currentLocale,
  translations,
  availableLocales,
  tenantSlug,
  canCreate,
  createAction,
}: {
  currentLocale: string;
  translations: Translation[];
  availableLocales: string[];
  tenantSlug: string;
  canCreate: boolean;
  createAction: (locale: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [busyLocale, setBusyLocale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sólo hay algo que enseñar si el espacio tiene más de un idioma.
  if (availableLocales.length < 2) return null;

  const create = (locale: string) => {
    setError(null);
    setBusyLocale(locale);
    startTransition(async () => {
      try {
        await createAction(locale);
      } catch (err) {
        /*
         * Crear un idioma acaba en `redirect()`, y Next señala ese salto
         * lanzando. `unstable_rethrow` deja pasar esa señal para que la
         * navegación ocurra; abajo sólo cae lo que de verdad falló —permisos,
         * un idioma ya traducido— que antes se perdía en silencio.
         */
        unstable_rethrow(err);
        setError(err instanceof Error ? err.message : "No se pudo traducir el contenido.");
        // Sólo se apaga aquí: si salió bien viene una navegación detrás y el
        // indicador debe seguir girando hasta que llegue.
        setBusyLocale(null);
      }
    });
  };

  const existing = new Map(translations.map((t) => [t.locale, t]));
  const missing = availableLocales.filter((l) => l !== currentLocale && !existing.has(l));

  return (
    <section className="space-y-2 border-t pt-4">
      <Label className="flex items-center gap-1.5">
        <Languages className="size-4" />
        Idiomas
      </Label>

      <ul className="space-y-1">
        <li className="flex items-center gap-2 rounded-[var(--radius)] bg-accent px-2 py-1.5 text-xs">
          <span className="font-medium">{localeLabel(currentLocale)}</span>
          <span className="ml-auto text-muted-foreground">estás aquí</span>
        </li>

        {translations.map((t) => (
          <li key={t.id}>
            <Link
              href={`/${tenantSlug}/content/${t.id}`}
              className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-xs hover:bg-accent"
            >
              <span>{localeLabel(t.locale)}</span>
              <span className="ml-auto text-muted-foreground">
                {t.status === "PUBLISHED" ? "publicado" : "borrador"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {canCreate && missing.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {missing.map((locale) => (
            <Button
              key={locale}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => create(locale)}
            >
              {pending && busyLocale === locale ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              {localeLabel(locale)}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Cada idioma se publica por separado y tiene su propia URL.
      </p>
    </section>
  );
}
