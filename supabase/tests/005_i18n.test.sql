-- =====================================================================
-- TEST: multi-idioma
--
-- Las invariantes de i18n fallan de forma cara: un slug duplicado entre
-- idiomas bloquea publicar, una categoría cruzada produce breadcrumbs
-- mezclados en la web del cliente, y un grupo con dos veces el mismo idioma
-- hace ambiguo cuál es "la versión en inglés".
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

create temporary table fx (k text primary key, v uuid);
grant select on fx to public;

insert into fx (k, v) values
  ('alice',   tests.create_user('alice@rukma.studio')),
  ('tenantA', tests.create_tenant('rukma')),
  ('tenantB', tests.create_tenant('acme'));

select tests.add_member((select v from fx where k='tenantA'), (select v from fx where k='alice'), 'OWNER');

-- =====================================================================
-- 1. Idiomas del tenant
-- =====================================================================
select is(
  (select locales from public.tenants where id = (select v from fx where k='tenantA')),
  array['es'],
  'un espacio nuevo arranca sólo en español'
);

select throws_ok(
  format('update public.tenants set default_locale = ''en'' where id = %L',
         (select v from fx where k='tenantA')),
  '23514', null,
  'el idioma principal no puede quedar fuera de los activos'
);

select throws_ok(
  format('update public.tenants set locales = array[''EN''] where id = %L',
         (select v from fx where k='tenantA')),
  '23514', null,
  'los códigos mal formados se rechazan (EN en vez de en)'
);

-- =====================================================================
-- 2. Contenido en un idioma no activado
-- =====================================================================
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, locale)
     values (%L, %L, ''x'', ''X'', ''fr'')',
    (select v from fx where k='tenantA'), (select v from fx where k='alice')
  ),
  '23514', null,
  'no se puede crear contenido en un idioma que el espacio no tiene'
);

update public.tenants set locales = array['es','en']
where id = (select v from fx where k='tenantA');

-- =====================================================================
-- 3. El slug es único POR IDIOMA
-- =====================================================================
insert into public.posts (tenant_id, author_id, slug, title, locale)
values ((select v from fx where k='tenantA'), (select v from fx where k='alice'),
        'sobre-nosotros', 'Sobre nosotros', 'es');

select lives_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, locale)
     values (%L, %L, ''sobre-nosotros'', ''About us'', ''en'')',
    (select v from fx where k='tenantA'), (select v from fx where k='alice')
  ),
  'el MISMO slug puede existir en otro idioma'
);

select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, locale)
     values (%L, %L, ''sobre-nosotros'', ''Duplicado'', ''es'')',
    (select v from fx where k='tenantA'), (select v from fx where k='alice')
  ),
  '23505', null,
  'pero no dos veces en el mismo idioma'
);

-- =====================================================================
-- 4. Un grupo, un idioma cada vez
-- =====================================================================
select throws_ok(
  format(
    'insert into public.posts (tenant_id, author_id, slug, title, locale, translation_group_id)
     values (%L, %L, ''otro-es'', ''Otro'', ''es'',
             (select translation_group_id from public.posts where slug = ''sobre-nosotros'' and locale = ''es''))',
    (select v from fx where k='tenantA'), (select v from fx where k='alice')
  ),
  '23505', null,
  'un grupo de traducción no puede tener dos veces el mismo idioma'
);

-- =====================================================================
-- 5. Categoría y contenido comparten idioma
-- =====================================================================
insert into public.categories (tenant_id, slug, name, locale)
values ((select v from fx where k='tenantA'), 'blog-es', 'Blog', 'es');

select throws_ok(
  format(
    'update public.posts set category_id = (select id from public.categories where slug = ''blog-es'')
     where slug = ''sobre-nosotros'' and locale = ''en''',
    ''
  ),
  '23514', null,
  'un contenido en inglés no puede colgar de una categoría en español'
);

select lives_ok(
  'update public.posts set category_id = (select id from public.categories where slug = ''blog-es'')
   where slug = ''sobre-nosotros'' and locale = ''es''',
  'y sí de una de su propio idioma'
);

-- =====================================================================
-- 6. Desactivar un idioma no destruye su contenido
-- =====================================================================
-- Es la diferencia entre "dejamos de publicar en inglés" y "tira el inglés".
update public.tenants set locales = array['es']
where id = (select v from fx where k='tenantA');

select is(
  (select count(*) from public.posts
   where tenant_id = (select v from fx where k='tenantA') and locale = 'en'),
  1::bigint,
  'desactivar un idioma conserva el contenido ya escrito'
);

-- =====================================================================
-- 7. El aislamiento entre clientes no cambia
-- =====================================================================
select tests.logout();
select tests.login_as(tests.create_user('intruso@evil.com'));

select is(
  (select count(*) from public.posts
   where tenant_id = (select v from fx where k='tenantA')),
  0::bigint,
  'los idiomas no abren ninguna puerta entre clientes'
);

select tests.logout();
select * from finish();
rollback;
