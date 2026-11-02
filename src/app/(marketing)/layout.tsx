/**
 * La landing se pinta SIEMPRE en oscuro, tenga el visitante el tema que
 * tenga guardado. No es un capricho: `.dark` anidado es justo el caso que
 * DESIGN.md contempla —un bloque oscuro dentro de una página clara— y evita
 * mantener dos versiones de la portada.
 *
 * `.dark` además activa las variantes `dark:` de Tailwind hacia dentro,
 * porque el custom-variant las resuelve como `&:is(.dark *)`.
 *
 * `--brand-secondary` se fija aquí y no en `tokens.yml`: el `brand` del YAML
 * es la identidad por defecto de los tenants, y cambiarlo repintaría los
 * paneles de los clientes que no han personalizado su marca. El turquesa es
 * el extremo superior del degradado del isotipo de Kanri.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="dark bg-background text-foreground"
      style={{ "--brand-secondary": "#04f8cf" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
