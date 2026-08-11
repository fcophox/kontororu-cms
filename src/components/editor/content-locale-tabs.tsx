"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2, AlertCircle } from "lucide-react";
import { localeLabel } from "@/lib/content/locales";

export type LocaleTab = {
  locale: string;
  /** `null` cuando ese idioma todavía no existe para este contenido. */
  postId: string | null;
};

/**
 * Barra de idiomas sobre el cuerpo del editor.
 *
 * Cada idioma es un contenido propio —con su URL, su SEO y su estado—, así que
 * la pestaña navega en lugar de cambiar lo que hay debajo: mostrar dos idiomas
 * en el mismo editor obligaría a decidir qué significa "Guardar".
 *
 * La pestaña de un idioma que aún no existe lo crea traducido de forma
 * automática, en BORRADOR. La traducción es un punto de partida para revisar,
 * nunca algo que salga publicado solo.
 */
export function ContentLocaleTabs({
  currentLocale,
  tabs,
  tenantSlug,
  canTranslate,
  createTranslatedAction,
  retranslateAction,
}: {
  currentLocale: string;
  tabs: LocaleTab[];
  tenantSlug: string;
  canTranslate: boolean;
  createTranslatedAction: (locale: string) => Promise<void>;
  /** Ausente cuando este contenido es el original y no hay nada que retraducir. */
  retranslateAction?: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLocale, setBusyLocale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tabs.length < 2) return null;

  const run = (locale: string, fn: () => Promise<void>) => {
    setError(null);
    setBusyLocale(locale);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo traducir el contenido.");
      } finally {
        setBusyLocale(null);
      }
    });
  };

  const handleTab = (tab: LocaleTab) => {
    if (tab.locale === currentLocale) return;

    if (tab.postId) {
      setBusyLocale(tab.locale);
      startTransition(() => router.push(`/${tenantSlug}/content/${tab.postId}`));
      return;
    }

    if (!canTranslate) return;
    run(tab.locale, () => createTranslatedAction(tab.locale));
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 border-b border-border/80 px-2">
        {tabs.map((tab) => {
          const isActive = tab.locale === currentLocale;
          const isBusy = pending && busyLocale === tab.locale;

          return (
            <button
              key={tab.locale}
              type="button"
              onClick={() => handleTab(tab)}
              disabled={pending || (!isActive && !tab.postId && !canTranslate)}
              title={
                tab.postId || isActive
                  ? undefined
                  : `Crear la versión en ${localeLabel(tab.locale)} traduciendo este contenido`
              }
              className={`flex items-center gap-1.5 pb-2 pt-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] disabled:cursor-not-allowed disabled:opacity-60 ${
                isActive
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              {isBusy && <Loader2 className="size-3 animate-spin" />}
              {localeLabel(tab.locale)}
              {!isActive && !tab.postId && (
                <span className="text-[10px] text-muted-foreground">· traducir</span>
              )}
            </button>
          );
        })}

        {retranslateAction && canTranslate && (
          <button
            type="button"
            onClick={() => run("__retranslate", retranslateAction)}
            disabled={pending}
            className="ml-auto mb-1 flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            title="Sobrescribe este idioma con una traducción nueva del original"
          >
            {busyLocale === "__retranslate" && pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Languages className="size-3" />
            )}
            Traducir de nuevo
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
