"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemeMode,
  type ThemeMode,
} from "@/lib/theme/mode";

/**
 * Alterna entre oscuro (por defecto) y claro. El estado real vive en el
 * <html>, que ya llega correcto desde <ThemeScript>; aquí sólo se lee tras
 * montar para que el icono coincida sin provocar mismatch de hidratación.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    setMode(isThemeMode(stored) ? stored : DEFAULT_THEME);
    setMounted(true);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={mode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      {mounted && mode === "light" ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  );
}
