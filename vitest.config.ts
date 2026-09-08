import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Las suites de integración leen las credenciales de `process.env`, y
    // vitest no carga `.env.local` por su cuenta. Ver tests/setup-env.ts.
    setupFiles: ["tests/setup-env.ts"],
    // Cada suite crea usuarios y tenants reales contra Supabase local:
    // en paralelo se pisarían entre sí y los fallos serían intermitentes.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
      // El SDK se prueba desde su CÓDIGO FUENTE, no desde `dist`: así un
      // cambio que rompa el contrato falla en el acto, sin recompilar.
      "@sdk": path.resolve(__dirname, "./packages/kontororu-client/src"),
    },
  },
});
