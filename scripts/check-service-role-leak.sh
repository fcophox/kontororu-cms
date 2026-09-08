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

echo "→ Verificando que todo createServiceClient() consulte filtrando por tenant_id…"
# Heurística deliberadamente ruidosa: el service role no aplica RLS, así que
# cada archivo que CONSULTE con él debe filtrar explícitamente. Revisar los
# avisos a mano — esta sección nunca rompe el build.
#
# No basta con "usa createServiceClient y no menciona tenant_id". Desde que las
# consultas de la API pública viven en `lib/api/queries`, las rutas crean el
# cliente y se lo pasan a esa capa, que es la que filtra. Con la regla anterior
# cada fachada sumaba un aviso que no se podía atender —no hay nada que filtrar
# en un fichero que no consulta— y la lista creció hasta diez entradas. Una
# lista de avisos que nadie puede vaciar deja de leerse, y entonces el guard ya
# no protege de nada.
#
# Así que se avisa de quien crea el cliente Y ADEMÁS accede a datos por su
# cuenta (`.from(` o `.rpc(`) sin nombrar el tenant. Quien sólo delega no
# aparece; el filtro se le exige a `queries.ts`, que sí consulta.
#
# Ojo con relajarlo más: si un fichero vuelve a consultar directamente, el
# aviso reaparece solo. Por eso la condición mira lo que el fichero HACE y no
# un comentario que alguien pudiera escribir para silenciarlo.
while IFS= read -r file; do
  if grep -qE 'tenant_id|tenantId' "$file"; then
    continue
  fi
  if ! grep -qE '\.from\(|\.rpc\(' "$file"; then
    continue
  fi
  echo "  ⚠ $file usa service_role, consulta por su cuenta y no menciona tenant_id — revisar"
done < <(grep -rl 'createServiceClient' src --include='*.ts' --include='*.tsx' 2>/dev/null || true)

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "✗ Fuga de credenciales detectada. Build detenido."
  exit 1
fi

echo "✓ Sin fugas de service role key."
