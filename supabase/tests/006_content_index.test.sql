-- =====================================================================
-- TEST: inventario de contenido agrupado por traducción
--
-- La vista `content_index` decide QUÉ fila representa a un contenido con
-- varios idiomas. Si se equivoca, el listado del CMS enseña el artículo dos
-- veces (que es el problema que vino a resolver) o —peor— esconde uno que
-- luego nadie encuentra.
--
-- Y como es una vista, se lleva el riesgo clásico: sin `security_invoker`
-- consultaría con los privilegios de quien la creó y filtraría el inventario
-- de un cliente a otro. Eso también se comprueba aquí.
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

update public.tenants set locales = array['es','en','fr']
where id = (select v from fx where k='tenantA');

-- ---------------------------------------------------------------------
-- Contenido: un grupo con tres idiomas y otro sólo en español.
-- ---------------------------------------------------------------------
insert into fx (k, v) values ('grupo1', gen_random_uuid());

insert into public.posts (tenant_id, author_id, slug, title, locale, status, published_at,
                          translation_group_id, created_at)
values
  ((select v from fx where k='tenantA'), (select v from fx where k='alice'),
   'mi-articulo', 'Mi artículo', 'es', 'PUBLISHED', now(),
   (select v from fx where k='grupo1'), now() - interval '3 days'),
  ((select v from fx where k='tenantA'), (select v from fx where k='alice'),
   'my-article', 'My article', 'en', 'DRAFT', null,
   (select v from fx where k='grupo1'), now() - interval '2 days'),
  ((select v from fx where k='tenantA'), (select v from fx where k='alice'),
   'mon-article', 'Mon article', 'fr', 'PUBLISHED', now(),
   (select v from fx where k='grupo1'), now() - interval '1 day');

insert into public.posts (tenant_id, author_id, slug, title, locale, status)
values ((select v from fx where k='tenantA'), (select v from fx where k='alice'),
        'solo-espanol', 'Sólo español', 'es', 'DRAFT');

select tests.login_as((select v from fx where k='alice'));

-- =====================================================================
-- 1. Un contenido, una fila
-- =====================================================================
select is(
  (select count(*) from public.content_index
    where tenant_id = (select v from fx where k='tenantA')),
  2::bigint,
  'tres idiomas de un artículo son UNA fila del inventario'
);

select is(
  (select locale from public.content_index
    where translation_group_id = (select v from fx where k='grupo1')),
  'es',
  'la fila que representa al grupo es la del idioma principal del espacio'
);

-- =====================================================================
-- 2. Los idiomas del grupo viajan con la fila
-- =====================================================================
select is(
  (select locales from public.content_index
    where translation_group_id = (select v from fx where k='grupo1')),
  array['en','es','fr'],
  'la fila lleva todos los idiomas del grupo, para filtrar y para los badges'
);

select is(
  (select jsonb_array_length(versions) from public.content_index
    where translation_group_id = (select v from fx where k='grupo1')),
  3,
  'y una entrada por idioma con su estado'
);

select is(
  (select count(*) from public.content_index,
     jsonb_array_elements(versions) v
    where translation_group_id = (select v from fx where k='grupo1')
      and v->>'status' = 'PUBLISHED'),
  2::bigint,
  'el estado de cada idioma se distingue: dos publicados, uno en borrador'
);

-- =====================================================================
-- 3. La papelera no cuenta
-- =====================================================================
select tests.logout();
update public.posts set deleted_at = now()
where translation_group_id = (select v from fx where k='grupo1') and locale = 'fr';
select tests.login_as((select v from fx where k='alice'));

select is(
  (select locales from public.content_index
    where translation_group_id = (select v from fx where k='grupo1')),
  array['en','es'],
  'un idioma en la papelera desaparece de los badges del original'
);

-- =====================================================================
-- 4. Sin original, manda el más antiguo
--
-- Si alguien borra la versión española y deja la inglesa, ese contenido NO
-- puede evaporarse del inventario: sería trabajo inalcanzable.
-- =====================================================================
select tests.logout();
update public.posts set deleted_at = now()
where translation_group_id = (select v from fx where k='grupo1') and locale = 'es';
select tests.login_as((select v from fx where k='alice'));

select is(
  (select locale from public.content_index
    where translation_group_id = (select v from fx where k='grupo1')),
  'en',
  'sin la versión del idioma principal, el grupo sigue apareciendo con la más antigua'
);

-- =====================================================================
-- 5. La vista no abre puertas entre clientes
-- =====================================================================
select tests.logout();
select tests.login_as(tests.create_user('intruso@evil.com'));

select is(
  (select count(*) from public.content_index
    where tenant_id = (select v from fx where k='tenantA')),
  0::bigint,
  'security_invoker: el inventario de un cliente no se ve desde otra cuenta'
);

select tests.logout();
select * from finish();
rollback;
