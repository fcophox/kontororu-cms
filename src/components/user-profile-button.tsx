"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

type Props = {
  email: string;
  fullName: string | null;
  role: string;
  isSuperadmin: boolean;
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

export function UserProfileButton({ email, fullName, role, isSuperadmin, tenantSlug }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const name = fullName || email.split("@")[0] || "Usuario";
  const initials = getInitials(name, email);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
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
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-background shadow-md">
          <Link
            href={`/${tenantSlug}/settings/profile`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => setIsOpen(false)}
          >
            <User className="size-4" />
            Ver Perfil
          </Link>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
