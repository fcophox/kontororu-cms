/**
 * La landing se pinta SIEMPRE en oscuro, tenga el visitante el tema que
 * tenga guardado. No es un capricho: `.dark` anidado es justo el caso que
 * DESIGN.md contempla —un bloque oscuro dentro de una página clara— y evita
 * mantener dos versiones de la portada.
 *
 * `.dark` además activa las variantes `dark:` de Tailwind hacia dentro,
 * porque el custom-variant las resuelve como `&:is(.dark *)`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark bg-background text-foreground">{children}</div>;
}
