"use server";

import { createServerClient } from "@/lib/supabase/server";

export type PasswordState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updatePassword(prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!newPassword || newPassword.length < 6) {
    return { status: "error", message: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (newPassword !== confirmPassword) {
    return { status: "error", message: "Las contraseñas no coinciden." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "success", message: "Contraseña actualizada exitosamente." };
}
