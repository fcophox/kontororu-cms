import fs from "node:fs";
import path from "node:path";

/**
 * Carga `.env.local` para los tests.
 *
 * Vitest no lee ficheros `.env`: Vite sólo expone los prefijados con `VITE_` y
 * a través de `import.meta.env`, no de `process.env`. En CI daba igual —el
 * workflow exporta las credenciales al entorno con `supabase status -o env`—
 * pero en local las suites de integración morían al importarse con
 * `Error: supabaseUrl is required`, que no dice nada de lo que falta.
 *
 * No pisa lo que ya venga del entorno: si alguien apunta los tests a otra
 * instancia con una variable exportada a mano, manda esa.
 */
const ENV_FILE = path.resolve(process.cwd(), ".env.local");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}
