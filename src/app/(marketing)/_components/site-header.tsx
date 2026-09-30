import Link from "next/link";

import { Button } from "@/components/ui/button";

const NAV = [
  { href: "#producto", label: "Producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#complementos", label: "Complementos" },
  { href: "#clientes", label: "Clientes" },
];

/**
 * Barra fija. El borde inferior es semitransparente para que el desenfoque
 * del fondo no se corte en seco al hacer scroll.
 */
export function SiteHeader({ dashboardPath }: { dashboardPath: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="flex items-baseline gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="text-lg font-bold tracking-tight">Kontorōru</span>
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">by Rukma Studio</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {dashboardPath ? (
            <Button asChild size="sm" className="transition-transform active:scale-[0.97]">
              <Link href={dashboardPath}>Ir a mi panel</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="hidden transition-transform active:scale-[0.97] sm:inline-flex"
              >
                <Link href="/login">Acceder</Link>
              </Button>
              <Button asChild size="sm" className="transition-transform active:scale-[0.97]">
                <Link href="/login">Entrar al panel</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
