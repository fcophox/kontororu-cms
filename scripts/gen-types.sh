#!/usr/bin/env bash
# =====================================================================
# Genera los tipos de Supabase SIN destruir el archivo si algo falla.
#
# `supabase gen types … > types.ts` trunca el destino ANTES de ejecutar nada:
# si Docker está parado o el CLI falla, el archivo queda vacío —o con un JSON
# de error dentro— y el typecheck se rompe por una causa que no tiene nada que
# ver con el código. Ha pasado dos veces.
#
# Aquí se escribe a un temporal, se comprueba que la salida tiene pinta de
# módulo TypeScript, y sólo entonces se sustituye el original.
# =====================================================================
set -euo pipefail

DEST="src/lib/supabase/types.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "→ Generando tipos desde la base local…"
if ! supabase gen types typescript --local > "$TMP" 2>/dev/null; then
  echo "✗ El CLI de Supabase falló. ¿Está levantado? (supabase start)" >&2
  echo "  $DEST se deja intacto." >&2
  exit 1
fi

if [ ! -s "$TMP" ] || ! grep -q "^export type Json" "$TMP"; then
  echo "✗ La salida no parece un módulo de tipos válido." >&2
  echo "  $DEST se deja intacto. Primeras líneas de lo recibido:" >&2
  head -3 "$TMP" >&2
  exit 1
fi

mv "$TMP" "$DEST"
trap - EXIT
echo "✓ $DEST actualizado ($(wc -l < "$DEST" | tr -d ' ') líneas)"
