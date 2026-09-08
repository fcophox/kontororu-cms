#!/usr/bin/env bash
# =====================================================================
# El SDK, tal y como lo recibe quien lo instala.
#
# La suite de tests prueba el SDK desde su CÓDIGO FUENTE —alias `@sdk`—
# para que un cambio en la API falle en el acto. Eso deja un hueco: nada
# comprueba el PAQUETE. Un `exports` mal escrito, un fichero fuera del
# tarball o un `.d.ts` que no resuelve pasan todos los tests y revientan
# en el primer `npm i` de un cliente, después de publicar y sin poder
# republicar la misma versión.
#
# Aquí se empaqueta de verdad, se instala en un proyecto limpio y se
# importa desde fuera, que es la única forma de ver ese fallo antes.
# =====================================================================
set -euo pipefail

pkg_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../packages/kontororu-client" && pwd)"
tsc="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/node_modules/.bin/tsc"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "→ Empaquetando…"
npm --prefix "$pkg_dir" run build >/dev/null
tarball="$pkg_dir/$(cd "$pkg_dir" && npm pack --silent)"
trap 'rm -rf "$work" "$tarball"' EXIT

echo "→ Instalando en un proyecto limpio…"
cd "$work"
# `type: module`: el paquete es ESM puro y así se consume.
cat > package.json <<'EOF'
{ "name": "smoke", "version": "1.0.0", "type": "module", "private": true }
EOF
npm install "$tarball" --silent --no-audit --no-fund

echo "→ Importando desde fuera…"
cat > smoke.mjs <<'EOF'
import assert from "node:assert/strict";
import { createClient, KontororuClient, KontororuError } from "@rukma/kontororu-client";
import {
  verifyWebhook,
  affectedTags,
  WebhookVerificationError,
} from "@rukma/kontororu-client/webhooks";

for (const [nombre, valor] of Object.entries({
  createClient,
  KontororuClient,
  KontororuError,
  verifyWebhook,
  affectedTags,
  WebhookVerificationError,
})) {
  assert.equal(typeof valor, "function", `no se exporta ${nombre}`);
}

const cms = createClient({ url: "https://ejemplo.test", apiKey: "kntr_live_x.y" });

// La superficie pública documentada en el README.
for (const metodo of [
  "listPosts",
  "getPost",
  "listCategories",
  "listMedia",
  "getMedia",
  "iteratePosts",
  "graphql",
]) {
  assert.equal(typeof cms[metodo], "function", `falta el método ${metodo}`);
}

// Las validaciones del constructor viajan en el build, no sólo en el fuente.
assert.throws(() => createClient({ url: "", apiKey: "k" }));
assert.throws(() => createClient({ url: "https://x.test", apiKey: "" }));

assert.ok(Array.isArray(affectedTags({ event: "post.published", data: { slug: "x" } })));
EOF
node smoke.mjs

echo "→ Comprobando que los tipos resuelven en un consumidor…"
cat > uso.ts <<'EOF'
import { createClient, type Post, type GraphQLResult } from "@rukma/kontororu-client";
import { verifyWebhook } from "@rukma/kontororu-client/webhooks";

const cms = createClient({ url: "https://x.test", apiKey: "k" });

export async function portada(): Promise<Post> {
  const res: GraphQLResult<{ posts: { nodes: Post[] } }> =
    await cms.graphql("{ posts { nodes { slug } } }");
  if (!res.data) throw new Error("sin datos");
  return res.data.posts.nodes[0]!;
}

export const verificar = verifyWebhook;
EOF

# Las dos resoluciones que se encuentra el paquete en la práctica: `node16`
# es la estricta —la que castiga un `exports` incompleto— y `bundler` es la
# que usan Next y Vite.
for resolucion in node16 bundler; do
  modulo="node16"
  [ "$resolucion" = "bundler" ] && modulo="esnext"

  cat > tsconfig.json <<EOF
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "$modulo",
    "moduleResolution": "$resolucion",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["uso.ts"]
}
EOF
  "$tsc" -p tsconfig.json
  echo "  ✓ moduleResolution: $resolucion"
done

echo "✓ El paquete se instala, se importa y sus tipos resuelven."
