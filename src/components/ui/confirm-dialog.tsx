"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: "default" | "destructive" | "warning";
  icon?: LucideIcon;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  variant = "default",
  icon: Icon = AlertTriangle,
}: ConfirmDialogProps) {
  const [isMounted, setIsMounted] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Listen for Escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, isPending]);

  // Handle scroll lock
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !isMounted) return null;

  const handleConfirm = () => {
    startTransition(async () => {
      await onConfirm();
    });
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with soft blur and fade-in */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-xs animate-backdrop-in"
        onClick={() => {
          if (!isPending) onCancel();
        }}
      />

      {/* Modal Card with scale/fade-in */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className={cn(
          "relative w-full max-w-[400px] overflow-hidden rounded-[var(--radius)] border border-border bg-card p-6 shadow-lg animate-modal-in focus:outline-hidden",
        )}
      >
        <div className="flex gap-4">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              variant === "destructive" && "bg-destructive/15 text-destructive dark:bg-destructive/20",
              variant === "warning" && "bg-amber-500/15 text-amber-500 dark:bg-amber-500/20",
              variant === "default" && "bg-primary/15 text-primary dark:bg-primary/20",
            )}
          >
            <Icon className="size-4" />
          </div>

          <div className="flex-1 space-y-1.5">
            <h3
              id="confirm-dialog-title"
              className="text-base font-semibold leading-none text-foreground tracking-tight"
            >
              {title}
            </h3>
            <p
              id="confirm-dialog-description"
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="h-9 px-4 cursor-pointer"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              "h-9 px-4 min-w-[80px] cursor-pointer",
              variant === "warning" && "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600",
            )}
          >
            {isPending ? "Procesando..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
