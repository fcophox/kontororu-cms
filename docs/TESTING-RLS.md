# Suite de aislamiento multi-tenant

> **Este es el único conjunto de tests que puede bloquear un despliegue.**
> En un SaaS sobre base de datos compartida, una fuga aquí no es un bug:
> es contenido de un cliente visible para otro.
>
> **Estado: 85 aserciones pgTAP + 45 de integración + 29 unitarias,
> todas en verde** contra Supabase local.

## Ejecutar

```bash
supabase start
npm run test:security      # pgTAP + guardia de credenciales (rápido, sin app)
npm run test:integration   # PostgREST + Storage + API (requiere la app en :3000)
```

## Las dos capas, y por qué hacen falta las dos

| Capa | Archivos | Qué demuestra |
|---|---|---|
| **pgTAP** (dentro de Postgres) | `supabase/tests/*.test.sql` | Que las políticas son correctas. Rápido, exhaustivo, sin red. |
| **Integración** (a través de la pila) | `tests/integration/isolation.test.ts` | Que lo son *en la superficie que un atacante alcanza*: PostgREST, embeds de relaciones, signed URLs, la API headless. |
| **Unitaria** (funciones puras) | `tests/unit/pure.test.ts`, `tests/unit/ssrf.test.ts` | Lo que no toca ni la base ni la red: slugs, saneado del branding, contraste WCAG, parsers de cabecera de imagen y la validación anti-SSRF de destinos de webhook. |

La segunda capa no es redundante. Una política puede ser perfecta y aun así
filtrarse por un **embed de PostgREST** (`select=*,tenants(*)`), por una
**signed URL** de Storage, o porque un route handler con `service_role` olvidó
el `.eq("tenant_id", …)`. Eso sólo se ve ejecutando la pila entera.

## Cobertura

### `001_tenant_isolation.test.sql` — el cliente A frente al cliente B
- Lectura: **0 filas visibles** del tenant ajeno en las 10 tablas con `tenant_id`, y en `post_tags` vía el post padre.
- Contraprueba: el usuario **sí ve las suyas** — una RLS que lo bloquee todo también pasaría un test de sólo ceros.
- Escritura cruzada: `INSERT` / `UPDATE` / `DELETE`, robo de API keys, redirección de webhooks a un endpoint propio.
- Auto-invitación a `tenant_users` del tenant ajeno (la escalada más directa).
- Referencia cruzada: post propio → categoría ajena (lo para el trigger, no la RLS).
- Usuario sin membresía: no ve nada, no puede crear tenants.
- Rol `anon`: sin acceso ni a la tabla.
- SuperAdmin: sí ve todo y sí da de alta clientes.

### `002_rbac_matrix.test.sql` — puertas adentro del tenant
- **Contributor**: crea sus borradores; no publica, no edita ajenos, no se atribuye autoría de otro, no ve API keys ni webhooks.
- **Editor**: publica y edita todo el contenido; no toca webhooks, no borra, no se auto-promueve.
- **Admin**: configura webhooks y branding, borra contenido, ve las API keys.

### `003_privilege_escalation.test.sql` — blindaje de columnas
- Un Client Admin no se auto-asigna `ENTERPRISE`, ni amplía `limits`, ni cambia el `slug` — **pero sí cambia su branding**.
- Nadie se auto-promueve a `is_superadmin`.
- `resolve_api_key` inalcanzable desde `authenticated`; `create_api_key` rechaza tenants ajenos.
- Constraints: `media.path` prefijado por `tenant_id`, webhooks sólo HTTPS, `PUBLISHED` exige `published_at`.

### `004_revisions.test.sql` — historial de versiones
- Se captura en cada edición, incluida la creación.
- Publicar, despublicar o pasar por la papelera **no** ensucian el historial.
- Retención de 30 versiones, conservando las más recientes.
- Un cliente no ve el historial de otro.
- Nadie —ni el OWNER— puede borrar, reescribir ni fabricar versiones: quien pudiera taparía sus propios pasos.

### `isolation.test.ts` — la pila real
- PostgREST: por id, por embed de relaciones, escritura y update cruzado.
- Storage: descarga, signed URL, listado y escritura fuera del prefijo propio.
- API headless: contenido acotado a la key, key inexistente, key revocada, `?tenant_id=` inyectado, borradores no expuestos.

## Detalles de implementación que conviene entender

**`set_config('role', …, true)` en lugar de `SET LOCAL ROLE`.** Dentro de una
función plpgsql, `SET ROLE` se revierte al salir. `set_config` con
`is_local = true` persiste hasta el fin de la transacción — el alcance exacto
de un test.

**Las aserciones tienen dos formas, y no es arbitrario.** Un `INSERT` que viola
`WITH CHECK` **lanza** `42501`. Un `UPDATE`/`DELETE` cruzado **no lanza**: RLS
filtra las filas antes, así que afecta a 0 filas y termina bien. Por eso unos
usan `throws_ok` y otros afirman sobre el conteo. Esperar una excepción en un
`UPDATE` cruzado daría un test que falla siempre y acaba desactivado.

**Cada archivo corre en su propia transacción con `rollback`.** Nada persiste,
el orden entre archivos no importa, y los helpers del esquema `tests` nunca
llegan a producción.

**`no_plan()` en lugar de `plan(N)`.** Con un plan fijo, añadir una aserción
obliga a recontar y el test falla por una razón que no es la interesante.

## Las excepciones conocidas del guard

`scripts/check-service-role-leak.sh` avisa cuando un archivo usa `service_role`
sin mencionar `tenant_id`. Hay **exactamente dos** avisos esperados; cualquier
otro es un bug real y hay que mirarlo.

| Archivo | Por qué es correcto |
|---|---|
| `api/internal/webhooks/dispatch/route.ts` | El worker drena la cola global de todos los tenants. El `tenant_id` va en cada fila de `webhook_deliveries`, no en el filtro. |
| `auth/callback/route.ts` | Marca aceptada la invitación del usuario que acaba de canjear su código. Filtra por `user_id`, que es más restrictivo que `tenant_id`: sólo puede tocar filas de esa persona. |

`(platform)/admin/actions.ts` también usa `service_role` —para crear cuentas,
que la anon key no puede hacer— pero no aparece en la lista porque sí menciona
`tenant_id`. Su barrera es el `requireSuperadmin()` al inicio de cada acción:
a partir de ahí RLS ya no protege nada.

## Al añadir una tabla nueva

1. Columna `tenant_id` + FK con `on delete cascade`.
2. `enable` **y** `force row level security`.
3. `GRANT` explícito a `authenticated`.
4. **Añadir el nombre de la tabla a los arrays de `unnest()` en `001`.**

El paso 4 es el que se olvida — pero la **guardia estructural** al inicio de
`001` lo cubre igualmente: recorre `pg_class` y falla si alguna tabla de
`public` con columna `tenant_id` carece de `rowsecurity`, de
`forcerowsecurity`, o de políticas. Añadir una tabla y olvidar la RLS rompe
el build por sí solo, sin depender de que nadie se acuerde de tocar el array
de `unnest()`.
