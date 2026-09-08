import Link from "next/link";
import { Heart } from "lucide-react";
import { reactionLabel } from "@/lib/addons/reactions";

/**
 * Las reacciones de este contenido, en la barra lateral del editor.
 *
 * Sólo lectura y sin botones: el editor es donde se escribe, y poner aquí un
 * "poner a cero" invita a tocarlo por error mientras se redacta. Esa acción
 * vive en la pantalla del complemento, que es adonde lleva el enlace.
 *
 * El número es del contenido entero, no de esta traducción: quien lo lea en
 * inglés y quien lo lea en español están aplaudiendo lo mismo.
 */
export function PostReactions({
  totals,
  href,
  isTranslated,
}: {
  totals: { key: string; total: number }[];
  href: string;
  isTranslated: boolean;
}) {
  const total = totals.reduce((acc, t) => acc + t.total, 0);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Reacciones</span>
        <Link href={href} className="text-xs text-muted-foreground hover:underline">
          Ver todas
        </Link>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía nadie ha reaccionado a este contenido.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Heart className="size-4 text-primary" />
            <span className="text-xl font-semibold tabular-nums">{total}</span>
          </div>
          {totals.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {totals.map((t) => `${reactionLabel(t.key)}: ${t.total}`).join(" · ")}
            </p>
          )}
        </>
      )}

      {isTranslated && (
        <p className="text-[10px] text-muted-foreground">
          Suma las de todos los idiomas de este contenido.
        </p>
      )}
    </section>
  );
}
