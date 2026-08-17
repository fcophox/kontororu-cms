-- =====================================================================
-- TEST BLOQUEANTE: pausar a un colaborador le corta el acceso de verdad
--
-- `suspended_at` sólo sirve si vive en RLS. Si se quedara en la interfaz,
-- el colaborador pausado seguiría leyendo y escribiendo desde PostgREST o
-- desde una pestaña ya abierta, que es exactamente el caso que la pausa
-- pretende cubrir (una cuenta comprometida, alguien que se fue de la
-- empresa). Este archivo comprueba que el corte ocurre en la base.
--
--   ejecutar: supabase test db
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

-- ---------------------------------------------------------------------
-- ESCENARIO
--   Tenant A — alice OWNER (activa), dana EDITOR (se pausará)
-- ---------------------------------------------------------------------
create temporary table fx (k text primary key, v uuid);
grant select on fx to public;

insert into fx (k, v) values
  ('alice',   tests.create_user('alice@rukma.studio')),
  ('dana',    tests.create_user('dana@rukma.studio')),
  ('tenantA', tests.create_tenant('rukma'));

insert into fx (k, v) values
  ('aliceMembership', tests.add_member(
    (select v from fx where k = 'tenantA'),
    (select v from fx where k = 'alice'), 'OWNER')),
  ('danaMembership', tests.add_member(
    (select v from fx where k = 'tenantA'),
    (select v from fx where k = 'dana'), 'EDITOR'));

create temporary table seeded (tenant text primary key, ids jsonb);
grant select on seeded to public;
insert into seeded values
  ('A', tests.seed_content((select v from fx where k = 'tenantA'), (select v from fx where k = 'alice')));

-- =====================================================================
-- 1. ANTES DE PAUSAR — dana trabaja con normalidad
-- =====================================================================
select tests.login_as((select v from fx where k = 'dana'));

select is(
  tests.rows_visible('posts', (select v from fx where k = 'tenantA')),
  1::bigint,
  'una colaboradora activa ve el contenido de su espacio'
);

select lives_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title)
     values (%L, %L, ''borrador-dana'', ''Borrador'')',
    (select v from fx where k = 'tenantA'),
    (select v from fx where k = 'dana')
  ),
  'una colaboradora activa puede escribir'
);

-- =====================================================================
-- 2. SE PAUSA SU ACCESO
-- =====================================================================
select tests.logout();
update public.tenant_users set suspended_at = now()
where id = (select v from fx where k = 'danaMembership');

select tests.login_as((select v from fx where k = 'dana'));

select is(
  tests.rows_visible(tbl, (select v from fx where k = 'tenantA')),
  0::bigint,
  format('pausada, dana deja de ver public.%s', tbl)
)
from unnest(array[
  'tenants', 'tenant_users', 'categories', 'tags',
  'posts', 'media', 'api_keys', 'webhooks', 'audit_logs'
]) as tbl;

-- Escribir tampoco: la política WITH CHECK ya no la reconoce como miembro.
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title)
     values (%L, %L, ''post-pausada'', ''No debería existir'')',
    (select v from fx where k = 'tenantA'),
    (select v from fx where k = 'dana')
  ),
  '42501',
  null,
  'pausada, dana no puede crear contenido'
);

-- Ni reactivarse a sí misma: su propia fila ya está fuera de su alcance.
with attempt as (
  update public.tenant_users set suspended_at = null
  where id = (select v from fx where k = 'danaMembership')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'pausada, dana no puede levantarse la pausa a sí misma');

-- =====================================================================
-- 3. EL RESTO DEL ESPACIO SIGUE FUNCIONANDO
--    Una pausa mal implementada en `user_tenant_ids()` afectaría a todos.
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k = 'alice'));

select is(
  tests.rows_visible('posts', (select v from fx where k = 'tenantA')),
  2::bigint,
  'la OWNER sigue viendo el contenido del espacio, incluida la pausada'
);

select is(
  (select count(*) from public.tenant_users
   where tenant_id = (select v from fx where k = 'tenantA')),
  2::bigint,
  'la OWNER sigue viendo a la colaboradora pausada en el equipo'
);

-- =====================================================================
-- 4. REACTIVACIÓN — el acceso vuelve intacto, sin reinvitar
-- =====================================================================
update public.tenant_users set suspended_at = null
where id = (select v from fx where k = 'danaMembership');

select tests.logout();
select tests.login_as((select v from fx where k = 'dana'));

select is(
  tests.rows_visible('posts', (select v from fx where k = 'tenantA')),
  2::bigint,
  'restablecida, dana recupera el acceso y conserva su rol'
);

select tests.logout();
select * from finish();
rollback;
