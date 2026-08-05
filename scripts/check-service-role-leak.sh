#!/usr/bin/env bash
# =====================================================================
# Guardia de CI: la service role key bypassea RLS por completo.
# Si acaba en un bundle de cliente, el aislamiento multi-tenant deja de
# existir para cualquiera que abra las devtools.
#
# Se comprueban dos cosas distintas:
#   1. Que la variable no se lea desde un archivo marcado "use client".
#   2. Que no se importe createServiceClient() desde componentes de cliente.
# =====================================================================
set -euo pipefail

fail=0

echo "→ Buscando SUPABASE_SERVICE_ROLE_KEY en código de cliente…"
while IFS= read -r file; do
  if head -n 5 "$file" | grep -qE '^\s*["'\'']use client["'\'']'; then
    if grep -q 'SUPABASE_SERVICE_ROLE_KEY' "$file"; then
      echo "  ✗ $file usa la service role key en un componente de cliente"
      fail=1
    fi
    if grep -q 'createServiceClient' "$file"; then
      echo "  ✗ $file importa createServiceClient() en un componente de cliente"
      fail=1
    fi
  fi
done < <(find src -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null || true)

echo "→ Verificando que la clave nunca lleve prefijo NEXT_PUBLIC_…"
if grep -rn 'NEXT_PUBLIC_SUPABASE_SERVICE' src .env.example 2>/dev/null; then
  echo "  ✗ una clave de servicio expuesta como NEXT_PUBLIC_"
  fail=1
fi

echo "→ Verificando que todo createServiceClient() filtre por tenant_id…"
# Heurística deliberadamente ruidosa: el service role no aplica RLS, así que
# cada archivo que lo use debe filtrar explícitamente. Revisar los avisos a mano.
while IFS= read -r file; do
  if ! grep -qE 'tenant_id|tenantId' "$file"; then
    echo "  ⚠ $file usa service_role y no menciona tenant_id — revisar"
  fi
done < <(grep -rl 'createServiceClient' src --include='*.ts' --include='*.tsx' 2>/dev/null || true)

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "✗ Fuga de credenciales detectada. Build detenido."
  exit 1
fi

echo "✓ Sin fugas de service role key."
