-- =====================================================================
-- Complemento Contactos — envíos de formularios
--
-- MODELO: una tabla para TODOS los formularios del cliente, distinguidos por
-- `form_key`. No una tabla por formulario, y no una columna por campo.
--
-- Un CMS no sabe qué campos tendrá el formulario de su cliente: hoy es
-- nombre/email/mensaje, mañana lleva presupuesto y país. Con columnas fijas,
-- cada formulario nuevo sería una migración; con `payload` JSONB, es un POST.
--
-- Lo que SÍ se sube a columna es lo que la bandeja necesita para ordenar,
-- buscar y mostrar la lista —nombre, email, mensaje, fecha— porque filtrar
-- por dentro del JSONB no usa los índices y la bandeja es la pantalla que
-- más se abre.
-- =====================================================================

create type form_submission_status as enum ('NEW', 'READ');

create table public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  -- Identifica el formulario de origen: 'contacto', 'agenda', 'presupuesto'.
  -- No hay catálogo de formularios: el primer envío da de alta el tipo, y la
  -- bandeja descubre las pestañas a partir de lo que ha llegado. Obligar a
  -- declarar el formulario antes de usarlo sería un paso de configuración que
  -- sólo sirve para que el primer envío se pierda con un 400.
  form_key    text not null,

  -- Campos que la bandeja lista. Se guardan aparte del payload, no en lugar
  -- de él: el payload sigue conservando el envío íntegro.
  name        text,
  email       citext,
  message     text,

  payload     jsonb not null default '{}'::jsonb,

  status      form_submission_status not null default 'NEW',
  is_archived boolean not null default false,

  /* Trazabilidad mínima para distinguir un envío legítimo de una avalancha:
     de qué página salió. Sin IP ni user-agent — son datos personales que
     nadie ha pedido guardar y que habría que justificar ante el cliente. */
  source_url  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint form_submissions_key_format check (form_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint form_submissions_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table public.form_submissions is
  'Envíos de los formularios del cliente. El tipo lo da form_key; el contenido íntegro, payload.';

-- La bandeja: por espacio, sin archivar y por fecha. Es la consulta por
-- defecto de la pantalla, así que el índice la cubre entera.
create index if not exists form_submissions_inbox_idx
  on public.form_submissions (tenant_id, is_archived, created_at desc);

-- El filtro por pestaña de formulario.
create index if not exists form_submissions_form_idx
  on public.form_submissions (tenant_id, form_key, created_at desc);

drop trigger if exists form_submissions_updated_at on public.form_submissions;
create trigger form_submissions_updated_at before update on public.form_submissions
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
--
-- Aquí no hay contenido del cliente: hay datos personales de TERCEROS que
-- escribieron a través de su web. Por eso el acceso es más estrecho que en
-- el resto del CMS —sólo OWNER/ADMIN— y no se abre a EDITOR ni a CONTRIBUTOR
-- como el contenido. Quien redacta el blog no necesita el correo de quien
-- pidió presupuesto.
-- ---------------------------------------------------------------------
alter table public.form_submissions enable row level security;
alter table public.form_submissions force row level security;

grant select, insert, update, delete on public.form_submissions to authenticated;
grant all on public.form_submissions to service_role;

drop policy if exists form_submissions_manage on public.form_submissions;
create policy form_submissions_manage on public.form_submissions for all to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

-- ---------------------------------------------------------------------
-- Pestañas de la bandeja
--
-- Los tipos de formulario se descubren agregando en la base, no trayendo
-- todas las filas para contarlas en memoria: una bandeja con miles de envíos
-- no puede pagar un `select form_key` completo sólo para pintar cuatro
-- pestañas.
--
-- SECURITY INVOKER a propósito: la función debe seguir sujeta a RLS. Con
-- DEFINER, cualquier usuario autenticado podría contar los envíos de otro
-- espacio pasando su uuid.
-- ---------------------------------------------------------------------
create or replace function public.form_submission_types(p_tenant uuid, p_archived boolean)
returns table (form_key text, total bigint, unread bigint)
language sql stable security invoker set search_path = public as $$
  select fs.form_key,
         count(*),
         count(*) filter (where fs.status = 'NEW')
  from public.form_submissions fs
  where fs.tenant_id = p_tenant
    and fs.is_archived = p_archived
  group by fs.form_key
  order by fs.form_key;
$$;

grant execute on function public.form_submission_types(uuid, boolean) to authenticated, service_role;
