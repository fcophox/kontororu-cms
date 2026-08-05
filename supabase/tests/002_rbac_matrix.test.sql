-- =====================================================================
-- TEST: matriz RBAC dentro de un mismo tenant
--
-- El test 001 cubre "un cliente no ve a otro". Este cubre lo que ocurre
-- puertas adentro: un Contributor no debe poder publicar, un Editor no
-- debe poder tocar API keys, y nadie debe poder auto-promoverse.
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

create temporary table fx (k text primary key, v uuid);
-- Legible tras login_as(): las temp tables no heredan permisos.
grant select on fx to public;

insert into fx (k, v) values
  ('owner',       tests.create_user('owner@rukma.studio')),
  ('admin',       tests.create_user('admin@rukma.studio')),
  ('editor',      tests.create_user('editor@rukma.studio')),
  ('contributor', tests.create_user('contrib@rukma.studio')),
  ('tenant',      tests.create_tenant('rukma'));

select tests.add_member((select v from fx where k='tenant'), (select v from fx where k='owner'),       'OWNER');
select tests.add_member((select v from fx where k='tenant'), (select v from fx where k='admin'),       'ADMIN');
select tests.add_member((select v from fx where k='tenant'), (select v from fx where k='editor'),      'EDITOR');
select tests.add_member((select v from fx where k='tenant'), (select v from fx where k='contributor'), 'CONTRIBUTOR');

create temporary table ids as
  select tests.seed_content((select v from fx where k='tenant'), (select v from fx where k='owner')) as v;
grant select on ids to public;

-- =====================================================================
-- CONTRIBUTOR — sólo sus propios borradores
-- =====================================================================
select tests.login_as((select v from fx where k='contributor'));

select lives_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, status)
     values (%L, %L, ''mi-borrador'', ''Mi borrador'', ''DRAFT'')',
    (select v from fx where k='tenant'), (select v from fx where k='contributor')
  ),
  'CONTRIBUTOR crea sus propios borradores'
);

select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, status, published_at)
     values (%L, %L, ''publicado'', ''Publicado'', ''PUBLISHED'', now())',
    (select v from fx where k='tenant'), (select v from fx where k='contributor')
  ),
  '42501', null,
  'CONTRIBUTOR no puede crear contenido ya publicado'
);

-- Atribuirse la autoría a otro para saltarse la restricción de "sus" posts
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, status)
     values (%L, %L, ''suplantado'', ''Suplantado'', ''DRAFT'')',
    (select v from fx where k='tenant'), (select v from fx where k='owner')
  ),
  '42501', null,
  'CONTRIBUTOR no puede crear posts a nombre de otro autor'
);

-- Publicar su propio borrador: el WITH CHECK exige status = DRAFT
select throws_ok(
  'update public.posts set status = ''PUBLISHED'', published_at = now() where slug = ''mi-borrador''',
  '42501', null,
  'CONTRIBUTOR no puede publicar ni su propio borrador'
);

-- Editar el post de otro (creado por el owner en seed_content)
with attempt as (
  update public.posts set title = 'Secuestrado'
  where author_id = (select v from fx where k='owner')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'CONTRIBUTOR no puede editar posts ajenos');

select is(
  (select count(*) from public.api_keys), 0::bigint,
  'CONTRIBUTOR no ve las API keys del tenant'
);
select is(
  (select count(*) from public.webhooks), 0::bigint,
  'CONTRIBUTOR no ve los webhooks del tenant'
);
select throws_ok(
  format('insert into public.categories (tenant_id, slug, name) values (%L, ''nueva'', ''Nueva'')',
         (select v from fx where k='tenant')),
  '42501', null,
  'CONTRIBUTOR no puede crear categorías'
);

-- =====================================================================
-- EDITOR — control total del contenido, cero acceso a configuración
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k='editor'));

select lives_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, status, published_at)
     values (%L, %L, ''editor-post'', ''Del editor'', ''PUBLISHED'', now())',
    (select v from fx where k='tenant'), (select v from fx where k='editor')
  ),
  'EDITOR publica contenido'
);

select lives_ok(
  format('insert into public.categories (tenant_id, slug, name) values (%L, ''servicios'', ''Servicios'')',
         (select v from fx where k='tenant')),
  'EDITOR gestiona categorías'
);

with attempt as (
  update public.posts set title = 'Revisado'
  where author_id = (select v from fx where k='owner')
  returning 1
)
select is((select count(*) from attempt), 1::bigint,
  'EDITOR sí puede editar posts de otros autores del tenant');

select is(
  (select count(*) from public.webhooks), 0::bigint,
  'EDITOR no ve los webhooks (configuración avanzada)'
);
select throws_ok(
  format('insert into public.webhooks (tenant_id, name, url) values (%L, ''x'', ''https://x.com'')',
         (select v from fx where k='tenant')),
  '42501', null,
  'EDITOR no puede crear webhooks'
);

-- Auto-promoción a ADMIN
with attempt as (
  update public.tenant_users set role = 'ADMIN'
  where user_id = (select v from fx where k='editor')
  returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'EDITOR no puede auto-promoverse a ADMIN');

-- Borrado de contenido: reservado a OWNER/ADMIN
with attempt as (
  delete from public.posts where slug = 'editor-post' returning 1
)
select is((select count(*) from attempt), 0::bigint,
  'EDITOR no puede borrar posts');

-- =====================================================================
-- ADMIN — configuración del tenant, pero no del plan
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k='admin'));

select lives_ok(
  format('insert into public.webhooks (tenant_id, name, url) values (%L, ''deploy'', ''https://acme.com/hook'')',
         (select v from fx where k='tenant')),
  'ADMIN gestiona webhooks'
);

select lives_ok(
  format('update public.tenants set branding = ''{"primary":"#ff0000"}''::jsonb where id = %L',
         (select v from fx where k='tenant')),
  'ADMIN puede cambiar el branding de su tenant'
);

select lives_ok(
  'delete from public.posts where slug = ''editor-post''',
  'ADMIN puede borrar posts'
);

select isnt_empty(
  format('select 1 from public.api_keys where tenant_id = %L', (select v from fx where k='tenant')),
  'ADMIN ve las API keys de su tenant'
);

select tests.logout();
select * from finish();
rollback;
