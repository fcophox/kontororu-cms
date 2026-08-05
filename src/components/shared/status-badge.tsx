const STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ARCHIVED: "bg-muted text-muted-foreground",
};

const LABELS: Record<string, string> = {
  PUBLISHED: "Publicado",
  DRAFT: "Borrador",
  ARCHIVED: "Archivado",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${STYLES[status] ?? ""}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
