"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronUp, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

type Props = {
  email: string;
  role: string;
  isSuperadmin: boolean;
  tenantSlug: string;
};

export function UserProfileButton({ email, role, isSuperadmin, tenantSlug }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-auto w-full justify-between px-3 py-2"
      >
        <div className="flex min-w-0 flex-col items-start">
          <div className="truncate text-xs text-foreground">{email}</div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
              {role}
            </span>
            {isSuperadmin && (
              <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                Rukma
              </span>
            )}
          </div>
        </div>
        <ChevronUp
          className="size-3 shrink-0 transition-transform"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
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
