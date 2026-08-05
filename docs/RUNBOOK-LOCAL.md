# Levantar Kontorōru en local y verificarlo

Guía para pasar de "el código compila" a "el aislamiento multi-tenant está
demostrado contra una base de datos real". Escrita para macOS (Apple Silicon).

Tiempo estimado: **30–40 min** la primera vez (la mayoría es descarga de
imágenes Docker), 2 min las siguientes.

---

## Paso 0 — Runtime de contenedores

Supabase local corre sobre Docker: Postgres, Auth (GoTrue), PostgREST, Storage
y Studio, cada uno en su contenedor. Necesitas un runtime.

**Opción recomendada en Apple Silicon — OrbStack.** Arranca en 2 segundos,
consume bastante menos RAM que Docker Desktop y es compatible con el CLI de Docker.

```bash
brew install --cask orbstack
```

Ábrelo una vez desde Launchpad para que instale su helper. Alternativa clásica:

```bash
brew install --cask docker
```

Con Docker Desktop hay que abrir la app y esperar a que la ballena de la barra
de menús deje de animarse.

Verifica antes de seguir:

```bash
docker info
```

Si eso falla, nada de lo que viene funcionará: el runtime no está arrancado.

---

## Paso 1 — CLI de Supabase

```bash
brew install supabase/tap/supabase
```

```bash
supabase --version
```

> No lo instales con `npm i -g supabase`: ese paquete está deprecado y da
> errores de plataforma en ARM. El `package.json` lo lista como devDependency
> sólo para que CI lo resuelva.

---

## Paso 2 — Arrancar el stack

Desde la raíz del proyecto:

```bash
supabase start
```

La primera vez descarga ~2,5 GB de imágenes. Cuando termina imprime las
credenciales locales:

```
API URL: http://127.0.0.1:54321
GraphQL URL: http://127.0.0.1:54321/graphql/v1
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
Inbucket URL: http://127.0.0.1:54324
anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

Puntos de interés:

| URL | Qué es |
|---|---|
| `:54321` | API — PostgREST, Auth, Storage |
| `:54322` | Postgres directo (para `psql`) |
| `:54323` | **Studio** — inspector de tablas y políticas RLS |
| `:54324` | **Inbucket** — buzón que captura los emails de invitación |

Las claves locales son deterministas y públicas: no son secretas, no las
confundas con las de producción.

---

## Paso 3 — Variables de entorno

```bash
eval "$(supabase status -o env)" && cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
CRON_SECRET=dev-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

Atajo equivalente:

```bash
npm run env:local
```

---

## Paso 4 — Migraciones y seed

```bash
supabase db reset
```

Esto **borra la base y la reconstruye** desde cero: aplica las tres migraciones
en orden y después `supabase/seed.sql`. Es el comando que usarás cada vez que
cambies el esquema — nunca edites una migración ya aplicada en producción, añade
una nueva.

Al terminar debe aparecer:

```
NOTICE: Seed listo — alice@rukma.studio / bob@acme.com / root@rukma.studio (password123)
```

Si falla, el mensaje indica el archivo y la línea. Los fallos típicos son de
orden de dependencias (una política que referencia una tabla aún no creada).

---

## Paso 5 — La suite de aislamiento

**El paso que importa.**

```bash
supabase test db
```

Ejecuta los tres archivos de `supabase/tests/` con pgTAP. Salida esperada:

```
supabase/tests/001_tenant_isolation.test.sql .. ok
supabase/tests/002_rbac_matrix.test.sql ....... ok
supabase/tests/003_privilege_escalation.test.sql ok
All tests successful.
```

### Cuando algo falla

pgTAP dice qué aserción y qué esperaba:

```
not ok 14 - alice no ve filas de otro tenant en public.media
#   Failed test 14
#          have: 1
#          want: 0
```

Un `have: 1` donde se espera `0` es **una fuga real de datos**, no un problema
del test. Empieza por mirar la política de esa tabla.

Para iterar sobre un solo archivo sin repetir los tres, instala `psql`:

```bash
brew install libpq && brew link --force libpq
```

y lánzalo directamente:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/001_tenant_isolation.test.sql
```

> Cada archivo abre su propia transacción y termina en `rollback`: puedes
> ejecutarlos las veces que quieras sin ensuciar la base ni resetear entre pasadas.

### Fallos encontrados en la primera ejecución real

Esta suite ya se ejecutó contra un Postgres real. Estos fueron los fallos,
todos corregidos — se documentan porque volverán a aparecer al añadir tests:

| Síntoma | Causa real |
|---|---|
| `operator does not exist: uuid = uuid[]` | `= any ((select fn()))` hace que Postgres lea el paréntesis como **subconsulta**, no como array. Se usa `in (select unnest(fn()))`. |
| `duplicate key ... users_email_partial_key` | los emails de los tests chocaban con los del seed. `tests.create_user` les añade un sufijo único. |
| `permission denied for schema tests` | tras `login_as()` el rol es `authenticated`, que no alcanzaba el esquema ni las tablas temporales. Resuelto con `grant usage` y `grant select ... to public`. |
| `column "tenant_id" does not exist` en `tenants` | esa tabla se identifica por `id`. `rows_visible` elige la columna según la tabla. |
| Conteos absolutos del SuperAdmin | el seed añade filas, así que las aserciones se acotan al escenario del test. |

Si al añadir un test aparece `function throws_ok(...) is not unique`, usa la
forma de 4 argumentos: `throws_ok(sql, errcode, errmsg, description)`.

Ojo con dos detalles de estructura:

- **`helpers.psql` no lleva extensión `.sql` a propósito.** `supabase test db`
  ejecuta como test *todos* los `.sql` de `supabase/tests/`, y los helpers no
  son un test.
- Cada archivo abre transacción y termina en `rollback`: se puede repetir sin
  resetear la base.

---

## Paso 6 — Tipos de TypeScript

```bash
npm run db:types
```

Sustituye el placeholder `Database = any` por los tipos reales. A partir de
aquí, una query que referencie una columna inexistente falla en `tsc`.

> ⚠️ Ese script redirige la salida del CLI al archivo. **Si Supabase no está
> arrancado, la salida es vacía y deja el archivo roto** (deja de ser un
> módulo y el typecheck falla). Si te pasa, restaura el contenido que
> documenta el propio archivo.

```bash
npx tsc --noEmit
```

Es normal que aparezcan errores nuevos aquí: son los que el `any` estaba
tapando. Merecen arreglarse uno a uno.

---

## Paso 7 — La aplicación

```bash
npm run dev
```

### Recorrido de verificación

Abre <http://localhost:3000> y entra como **alice@rukma.studio** / `password123`.

1. **Resumen** — deben verse los contadores de uso y las dos entradas del seed.
2. **Contenido → Nueva entrada** — escribe un título y algo de texto.
   Pulsa *Guardar*: debería redirigir a `/rukma/content/<uuid>`.
   → **Esto es el primer INSERT real que hace la aplicación.**
3. **Arrastra una imagen** al editor. Aparece al instante (URL local optimista)
   y se sustituye por la firmada del Storage. Compruébalo en Studio →
   Storage → `tenant-media`: la ruta debe empezar por el UUID del tenant.
4. **Publicar** — el badge pasa a *Publicado*.
5. **Campos personalizados** — añade `cliente` = `ACME` y guarda.

### El aislamiento, a ojo

Cierra sesión y entra como **bob@acme.com** / `password123`.

- La interfaz cambia **de gris a rojo**: es el theming dinámico leyendo el
  `branding` de otro tenant.
- En Contenido debe aparecer *sólo* `CONFIDENCIAL — Nota interna de ACME`.
- **Si ves cualquier contenido de Rukma Studio, el aislamiento está roto.**

Prueba también la URL directa: estando como bob, abre
<http://localhost:3000/rukma/content>. Debe dar **404**, no 403 — un 403
confirmaría que el tenant existe.

---

## Paso 8 — La API headless

Crea una API key desde `psql` (la pantalla de gestión llega en Fase 2):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select plain_key from create_api_key((select id from tenants where slug='rukma'), 'local');"
```

Copia la clave y consulta la API:

```bash
curl -H "Authorization: Bearer <PEGA_LA_CLAVE>" http://localhost:3000/api/v1/posts | jq
```

Verifica tres cosas: sólo devuelve contenido de `rukma`, no aparece ningún
borrador, y añadir `?tenant_id=<uuid-de-acme>` **no cambia el resultado**.

---

## Paso 9 — Tests de integración

Con `npm run dev` corriendo en otra terminal:

```bash
npm run test:integration
```

Atraviesan la pila real: PostgREST, Storage y la API headless. Cubren lo que
pgTAP no puede ver — embeds de relaciones, signed URLs y route handlers con
`service_role`.

---

## Paso 10 — El worker de webhooks

Publicar un post encola una entrega. Para drenarla a mano:

```bash
curl -X POST -H "Authorization: Bearer dev-secret" http://localhost:3000/api/internal/webhooks/dispatch
```

Inspecciona la cola en Studio → tabla `webhook_deliveries`. El seed apunta a
`https://rukma.studio/api/revalidate`, así que fallará con un error de red —
es lo correcto: verás `attempt` incrementándose. Para probar el camino feliz,
cambia la URL por una de <https://webhook.site>.

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `Cannot connect to the Docker daemon` | runtime parado | abrir OrbStack/Docker Desktop |
| `port 54322 already in use` | otro proyecto Supabase activo | `supabase stop --project-id <otro>` |
| `supabase start` se cuelga descargando | imágenes grandes | esperar; `docker pull` no muestra progreso aquí |
| Login correcto pero redirige a `/login` | falta `.env.local` o claves mal | repetir el paso 3 y reiniciar `npm run dev` |
| `Invalid API key` en el dashboard | `.env.local` con claves de otro arranque | las claves cambian si borras los volúmenes: repetir paso 3 |
| El editor no sube imágenes | bucket inexistente | lo crea la migración `_rls_policies`; revisar que `db reset` terminó bien |
| Cambios de esquema que no se ven | migración no aplicada | `supabase db reset` |

## Parar y limpiar

```bash
supabase stop
```

```bash
supabase stop --no-backup   # además borra los volúmenes: vuelta a cero
```
