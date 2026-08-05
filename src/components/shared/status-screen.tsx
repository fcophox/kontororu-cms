import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Base compartida de las pantallas de estado (error, 404, 403).
 *
 * Existe para que las tres se vean como el mismo producto: sin ella, cada
 * boundary acaba con su propio maquetado y el usuario percibe tres apps
 * distintas justo cuando algo ha ido mal.
 */
export function StatusScreen({
  icon: Icon,
  title,
  description,
  detail,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
  actions?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Icon className="mx-auto size-10 text-muted-foreground" aria-hidden />

        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        {detail && (
          <p className="mt-4 rounded-[var(--radius)] bg-muted px-3 py-2 text-left font-mono text-xs break-words text-muted-foreground">
            {detail}
          </p>
        )}

        {actions && <div className="mt-6 flex items-center justify-center gap-3">{actions}</div>}
      </div>
    </main>
  );
}

export function HomeButton({ href = "/", label = "Volver al inicio" }) {
  return (
    <Button asChild variant="outline">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
