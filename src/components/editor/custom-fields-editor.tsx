"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Editor de pares clave/valor sobre el JSONB `custom_fields`.
 *
 * Es lo que permite que un cliente añada "duración del proyecto" o "URL de
 * demo" sin que Rukma Studio despliegue una migración. El precio es que no
 * hay esquema ni validación de tipos: en Fase 2 esto se sustituye por un
 * definidor de esquema por tipo de contenido.
 */
export function CustomFieldsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(value);

  const setField = (key: string, next: string) => {
    onChange({ ...value, [key]: next });
  };

  const removeField = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const addField = () => {
    const key = newKey.trim();
    if (!key || key in value) return;
    onChange({ ...value, [key]: "" });
    setNewKey("");
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <label className="text-xs text-muted-foreground" htmlFor={`cf-${key}`}>
              {key}
            </label>
            <Input
              id={`cf-${key}`}
              value={String(val ?? "")}
              onChange={(e) => setField(key, e.target.value)}
              className="h-8"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-4 size-8"
            aria-label={`Eliminar campo ${key}`}
            onClick={() => removeField(key)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-1.5 pt-1">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Sin esto, Enter envía el formulario del editor entero.
            e.preventDefault();
            addField();
          }}
          placeholder="nombre_del_campo"
          className="h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Añadir campo"
          onClick={addField}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
