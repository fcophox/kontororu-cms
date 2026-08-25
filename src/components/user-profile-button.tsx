"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

type Props = {
  email: string;
  fullName: string | null;
  role: string;
  tenantSlug: string;
};

function getInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (parts[0]) {
    return parts[0][0]!.toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

export function UserProfileButton({ email, fullName, role, tenantSlug }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * El menú se cierra al tocar cualquier otra cosa.
   *
   * Se escucha `pointerdown` y no `click`: con `click` el menú seguía abierto
   * durante todo el gesto y un enlace de debajo llegaba a recibir la
   * pulsación con el desplegable aún encima.
   *
   * El listener sólo existe mientras el menú está abierto; dejarlo puesto
   * siempre haría que cada clic del panel pasara por aquí para nada.
   */
  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const name = fullName || email.split("@")[0] || "Usuario";
  const initials = getInitials(name, email);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="h-auto w-full justify-between gap-3 px-3 py-2.5 border border-border/80 bg-card/40 hover:bg-accent/60 hover:text-accent-foreground rounded-[var(--radius)]"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-xs tracking-wider">
            {initials}
          </div>
          {/* Info */}
          <div className="flex flex-col items-start min-w-0 flex-1 leading-normal">
            <div className="flex items-center gap-1.5 w-full">
              <span className="truncate font-semibold text-sm text-foreground">
                {name}
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-secondary-foreground shrink-0">
                {role}
              </span>
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>
          </div>
        </div>

        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/80" />
      </Button>

      {isOpen && (
        <div
          role="menu"
          // Las opciones se separan con aire, no con una línea: el bloque es
          // corto y el propio hueco ya agrupa. Cada una lleva su radio y su
          // respiro dentro del acolchado del menú, así que el resaltado al
          // pasar por encima queda como una pastilla y no como una banda de
          // borde a borde.
          className="absolute bottom-full left-0 right-0 mb-2 flex flex-col gap-0.5 rounded-[var(--radius)] border bg-background p-1.5 shadow-md"
        >
          <Link
            href={`/${tenantSlug}/profile`}
            role="menuitem"
            className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => setIsOpen(false)}
          >
            <User className="size-4" />
            Ver Perfil
          </Link>
          <button
            role="menuitem"
            onClick={() => signOut()}
            // Cerrar sesión se marca en rojo: es la única opción del menú que
            // deshace algo, y el resaltado mantiene el color en vez de
            // devolverla al gris del resto al pasar por encima.
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
