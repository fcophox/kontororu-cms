# Estado del proyecto

Punto de continuación. Lo que está hecho, lo que falta y las decisiones que no
se ven leyendo el código.

**Última sesión:** agosto 2026 · Fase 1, 2 y parte de la 3.

---

## Cómo arrancar

```bash
supabase start && npm run env:local && supabase db reset && npm run db:types && npm run dev
```

Detalle completo en **[RUNBOOK-LOCAL.md](RUNBOOK-LOCAL.md)**.

## Verificación

```bash
npm run test:unit          # 29 · funciones puras, sin red
supabase test db           # 96 · RLS, RBAC, i18n, historial (BLOQUEANTE)
npm run test:integration    # 53 · pila real, requiere la app en :3000
npx tsc --noEmit && npx eslint .
```

Todo en verde a día de hoy. La suite pgTAP es la única que puede frenar un
despliegue: ver **[TESTING-RLS.md](TESTING-RLS.md)**.

---

## Qué está hecho

| Área | Estado |
|---|---|
| Aislamiento multi-tenant (RLS `FORCE`) | ✅ con suite bloqueante |
| RBAC: Owner / Admin / Editor / Contributor | ✅ |
| Contenido: editor Tiptap, campos dinámicos, papelera, archivado | ✅ |
| Historial de versiones con restauración | ✅ retención de 30 |
| Medios: biblioteca, cuotas, dimensiones | ✅ |
| Equipo e invitaciones por email | ✅ |
| Marca por tenant con contraste WCAG garantizado | ✅ |
| API Keys y webhooks con backoff y reintento | ✅ |
| API headless: posts, categorías, media | ✅ + rate limiting por plan |
| Panel SuperAdmin: alta de clientes, planes, límites, auditoría | ✅ |
| Almacenamiento S3/R2 | ✅ migración sin ventana de corte |
| Multi-idioma | ✅ grupo de traducción |

## Qué falta

**Fase 3 pendiente**, por orden de dependencia:

1. **SDK `@rukma/kontororu-client`** — envoltorio tipado sobre la API. El más
   barato y el que más ahorra a cada cliente nuevo.
2. **GraphQL** en `/api/v1/graphql` — otro envoltorio sobre lo mismo.
3. **Analítica de contenido** — requiere decidir antes qué se quiere medir.
4. **Stripe** — sólo tiene sentido con precios reales que cobrar.
5. **Observabilidad** (Sentry / Logflare).

**Deuda menor conocida:**

- **Idiomas usa el permiso `branding.manage`.** Funciona, pero conceptualmente
  son cosas distintas: quizá merezca un permiso propio.
- **Autoguardado** del editor: hoy es botón manual.
- **Diff entre versiones**: el historial permite restaurar, pero no comparar.
- **Etiquetas (`tags`) no son multi-idioma.** Se dejaron compartidas a
  propósito —son etiquetas informales— pero si el cliente las usa como
  taxonomía visible, habrá que darles `locale` como a las categorías.

---

## Decisiones que no se deducen del código

Están explicadas en su sitio, pero conviene tenerlas a mano antes de tocar
nada cerca:

**El aislamiento vive en la base, no en la app.** RLS con `FORCE` en todas las
tablas con `tenant_id`. Los guards de `lib/auth` sirven para dar errores
legibles y ocultar controles inútiles, **no** para proteger datos. Si alguna
vez parece que un `where` es lo que aísla, algo está mal planteado.

**RLS decide *si* puedes tocar la fila; un trigger decide *qué columnas*.** Sin
`tg_protect_tenant_columns`, un Client Admin se auto-asigna el plan Enterprise
con un `PATCH` a PostgREST.

**Los helpers de RLS se envuelven en `(select fn())`.** Sin ese `select`,
Postgres evalúa la función una vez **por fila**, no por query.

**El proveedor de almacenamiento se guarda por archivo** (`media.provider`), no
por tenant. Es lo que permite migrar a S3 sin romper lo ya subido.

**El `src` de las imágenes es desechable.** Las URLs firmadas caducan; lo que
persiste es `data-media-id`, y la API vuelve a firmar al servir. Guardar la
URL firmada en el contenido rompía todas las imágenes a los 7 días **sin
ningún error visible en el CMS**.

**Sin `?locale=` la API devuelve el idioma principal, no todos.** Es lo que
evita que una web ya conectada empiece a ver artículos duplicados cuando su
cliente active un segundo idioma.

**Los webhooks se encolan, no se envían.** Un trigger escribe en
`webhook_deliveries`; un worker drena. Llamar por HTTP dentro del `UPDATE`
convertiría la web caída de un cliente en un timeout dentro de una
transacción.

---

## Trampas del entorno local

**`next dev` y `next build` no comparten directorio** — `dev` escribe en
`.next-dev` vía `distDir`. Se separó porque compilar con el servidor de
desarrollo activo corrompía los manifiestos y producía 500 opacos.

**`npm run db:types` no destruye el archivo si falla.** Pasa por
`scripts/gen-types.sh`, que valida la salida antes de sustituir. La versión
directa (`supabase gen types > types.ts`) truncaba el destino antes de
ejecutarse y dejaba el typecheck roto por una causa no relacionada.

**OrbStack puede pararse solo.** Si `supabase` empieza a fallar con errores de
socket de Docker: `orb start`. Y si `docker` no está en el PATH porque
OrbStack nunca tuvo su primer arranque gráfico:

```bash
export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"
```

**Los tests de S3 usan el gateway S3-compatible de Supabase local.** No hace
falta MinIO ni una cuenta de AWS; las credenciales salen de
`supabase status -o env` y están en `.env.local`.

---

## Documentación

| Documento | Para quién |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Quien mantiene el CMS |
| [API.md](API.md) | Quien conecta una web al CMS |
| [TESTING-RLS.md](TESTING-RLS.md) | Antes de tocar RLS o añadir una tabla |
| [RUNBOOK-LOCAL.md](RUNBOOK-LOCAL.md) | Primera puesta en marcha |
