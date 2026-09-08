import { localeLabel, orderVersions, type LocaleVersion } from "@/lib/content/locales";

const STATUS_LABELS: Record<LocaleVersion["status"], string> = {
  PUBLISHED: "publicado",
  DRAFT: "borrador",
  ARCHIVED: "archivado",
};

/**
 * Idiomas que tiene un contenido, y cuáles están vivos.
 *
 * El listado enseña una fila por contenido, no por idioma, así que estos
 * badges son lo único que distingue un artículo traducido de uno que sólo
 * existe en español.
 *
 * El sólido/atenuado no es decoración: un idioma en borrador NO se sirve en la
 * web. Sin la distinción, ver "EN" en el listado haría pensar que el inglés
 * está publicado mientras el visitante sigue recibiendo un 404.
 *
 * Con un solo idioma no se pinta nada: en un espacio monolingüe, un "ES" en
 * las cincuenta filas no informa de nada.
 */
export function LocaleBadges({
  versions,
  originalLocale,
}: {
  versions: LocaleVersion[];
  originalLocale: string;
}) {
  if (versions.length < 2) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {orderVersions(versions, originalLocale).map((version) => {
        const isLive = version.status === "PUBLISHED";
        return (
          <span
            key={version.id}
            title={`${localeLabel(version.locale)} · ${STATUS_LABELS[version.status]}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isLive
                ? "bg-foreground/10 text-foreground"
                : "border border-dashed border-border text-muted-foreground/70"
            }`}
          >
            {version.locale}
          </span>
        );
      })}
    </span>
  );
}
