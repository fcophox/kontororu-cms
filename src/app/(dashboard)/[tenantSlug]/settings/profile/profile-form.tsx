"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type PasswordState } from "./actions";

export function ProfileForm({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string | null;
  role: string;
}) {
  const [state, action, isPending] = useActionState(updatePassword, { status: "idle" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="grid gap-12 lg:grid-cols-2">
      {/* Readonly profile data */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-foreground">Tus Datos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Información de tu cuenta y rol actual en este espacio de trabajo.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Correo electrónico</Label>
            <Input type="text" readOnly disabled value={email} className="bg-muted/50" />
          </div>
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input type="text" readOnly disabled value={fullName ?? ""} className="bg-muted/50" />
          </div>
          <div className="grid gap-2">
            <Label>Rol en este espacio</Label>
            <Input type="text" readOnly disabled value={role} className="bg-muted/50 capitalize" />
          </div>
        </div>
      </section>

      {/* Password change form */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-foreground">Seguridad</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Actualiza tu contraseña para mantener tu cuenta segura.
          </p>
        </div>
        <form action={action} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <div className="relative">
              <Input 
                id="newPassword" 
                name="newPassword" 
                type={showPassword ? "text" : "password"} 
                required 
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <div className="relative">
              <Input 
                id="confirmPassword" 
                name="confirmPassword" 
                type={showConfirm ? "text" : "password"} 
                required 
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {state.status === "error" && (
            <p className="text-sm font-medium text-destructive">{state.message}</p>
          )}
          {state.status === "success" && (
            <p className="text-sm font-medium text-success">{state.message}</p>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Cambiar contraseña"}
          </Button>
        </form>
      </section>
    </div>
  );
}
