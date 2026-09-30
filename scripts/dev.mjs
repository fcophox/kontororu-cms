#!/usr/bin/env node
/**
 * `npm run dev`: el servidor de Next y el vigilante de tokens.yml juntos.
 *
 * Antes `dev` generaba los tokens una sola vez al arrancar, así que un cambio
 * en tokens.yml con el servidor encendido no llegaba a la pantalla hasta
 * reiniciar. Ahora el vigilante regenera al guardar y Next recoge el CSS
 * generado por HMR.
 *
 * Un script y no un `&` en package.json: si el padre muere por SIGTERM (no
 * por Ctrl+C), un vigilante en segundo plano se quedaría huérfano para
 * siempre. Aquí los dos procesos caen juntos.
 */

import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Una pasada síncrona primero: Next no debe arrancar con tokens viejos, y un
// tokens.yml roto tiene que parar el arranque, no quedarse en un aviso.
if (spawnSync(process.execPath, ["scripts/generate-tokens.mjs"], { cwd: ROOT, stdio: "inherit" }).status !== 0) {
  process.exit(1);
}

const tokens = spawn(process.execPath, ["scripts/generate-tokens.mjs", "--watch"], {
  cwd: ROOT,
  stdio: "inherit",
});

const next = spawn("next", ["dev", "--turbopack", ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-dev" },
});

let stopping = false;

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  tokens.kill();
  next.kill();
  process.exit(code);
}

next.on("exit", (code) => shutdown(code ?? 0));
tokens.on("exit", (code) => {
  if (stopping) return;
  // El vigilante no debería salir nunca por su cuenta; si lo hace, que se
  // note en vez de seguir con tokens congelados sin avisar.
  console.error(`tokens · el vigilante terminó (código ${code}); se detiene el servidor`);
  shutdown(1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}
