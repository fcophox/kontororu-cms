-- =====================================================================
-- TEST: escalada de privilegios y blindaje de columnas
--
-- RLS decide SI puedes actualizar una fila; el trigger decide QUÉ columnas.
-- Un Client Admin tiene permiso legítimo sobre su propia fila de `tenants`:
-- sin el trigger, un PATCH directo a PostgREST le regala el plan Enterprise.
--
-- Nota sobre la forma de las aserciones: el trigger no lanza error, revierte
-- los valores en silencio. Por eso se afirma sobre el estado final de la
-- fila, no con throws_ok — un UPDATE "exitoso" que no cambia nada es
-- exactamente el comportamiento buscado.
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

create temporary table fx (k text primary key, v uuid);
-- Legible tras login_as(): las temp tables no heredan permisos.
grant select on fx to public;

insert into fx (k, v) values
  ('admin',  tests.create_user('admin@acme.com')),
  ('root',   tests.create_user('root@rukma.studio', true)),
  ('tenant', tests.create_tenant('acme')),
  ('ajeno',  tests.create_tenant('otro-cliente'));

select tests.add_member((select v from fx where k='tenant'), (select v from fx where k='admin'), 'OWNER');

-- El slug se genera con sufijo aleatorio, así que se guarda el original
-- en vez de compararlo con una constante.
create temporary table orig as
  select slug::text as slug from public.tenants where id = (select v from fx where k='tenant');
grant select on orig to public;

-- =====================================================================
-- 1. Columnas reservadas a Rukma Studio
-- =====================================================================
select tests.login_as((select v from fx where k='admin'));

update public.tenants set
  plan       = 'ENTERPRISE',
  status     = 'ACTIVE',
  limits     = '{"maxUsers":99999,"maxPosts":99999,"maxStorageMb":999999}'::jsonb,
  slug       = 'secuestrado',
  db_mode    = 'SHARED',
  deleted_at = null,
  branding   = '{"primary":"#00ff00","secondary":"#0000ff","radius":"1rem"}'::jsonb
where id = (select v from fx where k='tenant');

select is(
  (select plan from public.tenants where id = (select v from fx where k='tenant')),
  'PRO'::tenant_plan,
  'el Client Admin NO puede auto-asignarse el plan ENTERPRISE'
);
select is(
  (select (limits ->> 'maxPosts') from public.tenants where id = (select v from fx where k='tenant')),
  '100',
  'el Client Admin NO puede ampliar sus propios límites'
);
select is(
  (select slug::text from public.tenants where id = (select v from fx where k='tenant')),
  (select slug from orig),
  'el Client Admin NO puede cambiar el slug del tenant'
);
select is(
  (select (branding ->> 'primary') from public.tenants where id = (select v from fx where k='tenant')),
  '#00ff00',
  'el Client Admin SÍ puede cambiar su branding'
);

-- =====================================================================
-- 2. Flag de SuperAdmin
-- =====================================================================
update public.users_profiles set is_superadmin = true
where id = (select v from fx where k='admin');

select is(
  (select is_superadmin from public.users_profiles where id = (select v from fx where k='admin')),
  false,
  'un usuario no puede auto-promoverse a SuperAdmin'
);

-- El perfil de un usuario de otro tenant ni siquiera es visible: sin
-- lectura no hay enumeración de cuentas del resto de clientes.
select is(
  (select count(*) from public.users_profiles where id = (select v from fx where k='root')),
  0::bigint,
  'no se ven perfiles de usuarios ajenos al propio tenant'
);

-- =====================================================================
-- 3. Funciones sensibles no alcanzables desde el cliente
-- =====================================================================

-- resolve_api_key valida credenciales: sólo service_role.
select throws_ok(
  'select * from public.resolve_api_key(''kntr_live_x'', ''secret'')',
  '42501', null,
  'un usuario autenticado no puede invocar resolve_api_key'
);

-- create_api_key sí es invocable, pero comprueba el rol internamente.
select throws_ok(
  format('select * from public.create_api_key(%L, ''robada'')',
         (select v from fx where k='ajeno')),
  'P0001', 'no autorizado',
  'no se puede crear una API key para un tenant ajeno'
);

-- =====================================================================
-- 4. Constraints de integridad que no dependen de RLS
-- =====================================================================

-- La ruta física del media debe empezar por el tenant_id: un path
-- manipulado permitiría leer objetos de otro cliente vía signed URL.
select throws_ok(
  format(
    'insert into public.media (tenant_id, bucket, path, mime_type, size_bytes)
     values (%L, ''tenant-media'', ''../otro-tenant/secreto.pdf'', ''application/pdf'', 1)',
    (select v from fx where k='tenant')
  ),
  '23514', null,
  'media.path debe estar prefijado por el tenant_id'
);

-- Webhook a HTTP plano: filtraría el payload en claro.
select throws_ok(
  format(
    'insert into public.webhooks (tenant_id, name, url) values (%L, ''inseguro'', ''http://acme.com/hook'')',
    (select v from fx where k='tenant')
  ),
  '23514', null,
  'los webhooks sólo aceptan HTTPS'
);

-- Un post PUBLISHED sin fecha rompería el orden de la API pública.
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, status)
     values (%L, %L, ''sin-fecha'', ''Sin fecha'', ''PUBLISHED'')',
    (select v from fx where k='tenant'), (select v from fx where k='admin')
  ),
  '23514', null,
  'un post PUBLISHED exige published_at'
);

-- =====================================================================
-- 5. El SuperAdmin sí puede lo que el cliente no
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k='root'));

select lives_ok(
  format('update public.tenants set plan = ''ENTERPRISE'', status = ''SUSPENDED'' where id = %L',
         (select v from fx where k='tenant')),
  'el SuperAdmin sí puede cambiar plan y estado'
);
select is(
  (select plan from public.tenants where id = (select v from fx where k='tenant')),
  'ENTERPRISE'::tenant_plan,
  'el cambio de plan del SuperAdmin persiste'
);

select tests.logout();
select * from finish();
rollback;
