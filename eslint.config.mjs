import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Sin este archivo, `next lint` abre un asistente interactivo pidiendo elegir
 * configuración: en CI se queda esperando una respuesta que nunca llega.
 */
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // `next-env.d.ts` y los tipos de Supabase los genera la herramienta:
    // corregir su estilo no aporta nada y se revierte en cada regeneración.
    ignores: [
      ".next/**",
      ".next-dev/**",
      "packages/*/dist/**",
      "node_modules/**",
      "supabase/**",
      "next-env.d.ts",
      "src/lib/supabase/types.ts",
    ],
  },
  {
    rules: {
      // Los warnings de deps de hooks se tratan como error en código nuevo:
      // un efecto con dependencias incompletas es un stale closure esperando.
      "react-hooks/exhaustive-deps": "error",
    },
  },
];

export default config;
