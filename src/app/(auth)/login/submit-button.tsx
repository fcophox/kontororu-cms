"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Vive aparte de la página para que ésta siga siendo Server Component:
// `useFormStatus` sólo funciona en cliente y dentro del <form>.
export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full h-10 mt-2">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Accediendo…" : "Acceder"}
    </Button>
  );
}
