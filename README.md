# Kontorōru CMS

CMS Headless Multi-tenant · producto SaaS de **Rukma Studio**.

Un solo despliegue controlado por Rukma Studio; cada cliente gestiona su contenido,
su marca y sus integraciones. Aislamiento estricto por `tenant_id` con Row Level
Security de Postgres.

📖 **[Manual de uso →](docs/MANUAL.md)** — roles, alta de clientes y cada pantalla
📍 **[Estado del proyecto y punto de continuación →](docs/ESTADO.md)**
📐 **[Arquitectura técnica completa →](docs/ARCHITECTURE.md)**
🔒 **[Suite de aislamiento multi-tenant →](docs/TESTING-RLS.md)** — bloqueante para desplegar
▶️ **[Runbook: levantarlo y verificarlo en local →](docs/RUNBOOK-LOCAL.md)**
🔌 **[API para los clientes →](docs/API.md)**
🎨 **[Sistema de diseño y tokens →](DESIGN.md)** — `tokens.yml` es la fuente de verdad

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Shadcn/UI · Supabase (Postgres, RLS, Auth, Storage) · Tiptap

## Puesta en marcha

```bash
npm install
supabase start                # imprime URL y claves
cp .env.example .env.local    # pegarlas aquí
supabase db reset             # migraciones + seed
npm run db:types              # genera los tipos (sustituye el placeholder)
npm run dev
```

Usuarios del seed, sólo para desarrollo local (contraseña `password123`):

| Email | Rol |
|---|---|
| `alice@rukma.studio` | OWNER de `rukma` |
| `bob@acme.com` | OWNER de `acme` |
| `fcojhormazabalh@gmail.com` | SuperAdmin |

Entra con uno y luego con el otro: los colores de marca cambian por completo
—es el theming dinámico— y el contenido de cada uno debe ser invisible para
el otro.

Generar tipos tras cambiar el esquema:

```bash
supabase gen types typescript --local > src/lib/supabase/types.ts
```

## Variables de entorno

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | Cliente y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Sesión de usuario (sujeta a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **servidor** | API headless y worker — bypassea RLS |
| `CRON_SECRET` | **servidor** | Autoriza el dispatcher de webhooks |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` no debe aparecer nunca en un archivo `"use client"`.

## Despliegue

La aplicación corre en **Railway**, que construye y arranca pero no toca la
base de datos. Las migraciones las aplica **GitHub Actions**: el job `migrate`
de [ci.yml](.github/workflows/ci.yml) hace `supabase db push` en los push a
`main`, y sólo después de que pasen los tests de aislamiento y de calidad.

No corre en todos los push: un job previo mira si el push tocó
`supabase/migrations/` y, si no, `migrate` se salta. Así, con revisores
configurados, sólo se pide aprobación cuando de verdad hay algo que aplicar —
una aprobación que casi siempre sobra se acaba dando sin mirar.

También se puede lanzar a mano desde *Actions → CI → Run workflow*, sobre
`main`, que es lo que hay que usar para reintentar un push interrumpido.

Secrets que necesita, en *Settings → Secrets and variables → Actions*:

| Secret | De dónde sale |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Cuenta de Supabase → *Account → Access Tokens* |
| `SUPABASE_PROJECT_REF` | Referencia del proyecto (`supabase.com/dashboard/project/<ref>`) |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base del proyecto |

El job está asociado al Environment `production`: si le añades revisores
requeridos, cada aplicación espera una aprobación manual y queda registrado
quién la dio.

⚠️ **Escribe las migraciones para poder reaplicarlas.** `db push` aplica lo que
falte según `supabase_migrations.schema_migrations` del proyecto remoto, y un
push interrumpido puede dejar objetos creados sin que la migración conste como
aplicada: al reintentar, un `create trigger`, `create index` o `create policy`
sin guarda choca con lo que él mismo creó y no hay salida sin tocar la base a
mano. Usa `create or replace`, `if not exists`, o un `drop ... if exists`
previo. Pasó con [20260818000100](supabase/migrations/20260818000100_addon_events.sql).

Si el historial remoto se desalinea del directorio —porque algo se aplicó por
fuera—, se arregla con `supabase migration repair` antes de volver a empujar.

## Estructura

```
src/app/(platform)/admin      Panel SuperAdmin (Rukma Studio)
src/app/(dashboard)/[slug]    Dashboard del cliente
src/app/api/v1                API headless pública (API Keys)
src/lib/theme                 Theming dinámico por tenant
src/lib/storage               Adapter de almacenamiento (Supabase → S3/R2)
src/components/editor         Editor Tiptap
supabase/migrations           Esquema + RLS
```
