-- =====================================================================
-- TEST: historial de versiones
--
-- El historial es la red que impide perder trabajo por un despiste. Sus tres
-- propiedades —se captura siempre, no se puede manipular, y no crece sin
-- límite— fallan en silencio: nadie lo nota hasta que hace falta restaurar.
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

create temporary table fx (k text primary key, v uuid);
grant select on fx to public;

insert into fx (k, v) values
  ('alice',  tests.create_user('alice@rukma.studio')),
  ('bob',    tests.create_user('bob@acme.com')),
  ('editor', tests.create_user('editor@rukma.studio')),
  ('tenantA', tests.create_tenant('rukma')),
  ('tenantB', tests.create_tenant('acme'));

select tests.add_member((select v from fx where k='tenantA'), (select v from fx where k='alice'), 'OWNER');
select tests.add_member((select v from fx where k='tenantA'), (select v from fx where k='editor'), 'EDITOR');
select tests.add_member((select v from fx where k='tenantB'), (select v from fx where k='bob'), 'OWNER');

create temporary table seeded (tenant text primary key, ids jsonb);
grant select on seeded to public;
insert into seeded values
  ('A', tests.seed_content((select v from fx where k='tenantA'), (select v from fx where k='alice'))),
  ('B', tests.seed_content((select v from fx where k='tenantB'), (select v from fx where k='bob')));

-- =====================================================================
-- 1. Captura automática
-- =====================================================================
select is(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  1::bigint,
  'crear contenido deja ya su primera versión'
);

update public.posts set title = 'Título editado'
where id = (select (ids->>'post')::uuid from seeded where tenant='A');

select is(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  2::bigint,
  'editar el título añade una versión'
);

select is(
  (select title from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')
   order by version desc limit 1),
  'Título editado',
  'la versión guarda el contenido nuevo'
);

-- =====================================================================
-- 2. Ruido: los cambios que no son ediciones no ensucian el historial
-- =====================================================================
update public.posts set status = 'DRAFT'
where id = (select (ids->>'post')::uuid from seeded where tenant='A');
update public.posts set status = 'PUBLISHED', published_at = now()
where id = (select (ids->>'post')::uuid from seeded where tenant='A');
update public.posts set deleted_at = now()
where id = (select (ids->>'post')::uuid from seeded where tenant='A');
update public.posts set deleted_at = null
where id = (select (ids->>'post')::uuid from seeded where tenant='A');

select is(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  2::bigint,
  'publicar, despublicar y pasar por la papelera NO generan versiones'
);

-- =====================================================================
-- 3. Retención
-- =====================================================================
do $$
declare i int; v_post uuid;
begin
  select (ids->>'post')::uuid into v_post from seeded where tenant='A';
  for i in 1..40 loop
    update public.posts set title = 'Edición ' || i where id = v_post;
  end loop;
end $$;

select is(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  30::bigint,
  'el historial se poda a las 30 últimas versiones por contenido'
);

select is(
  (select title from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')
   order by version desc limit 1),
  'Edición 40',
  'la poda conserva las MÁS RECIENTES, no las primeras'
);

-- =====================================================================
-- 4. Aislamiento entre clientes
-- =====================================================================
select tests.login_as((select v from fx where k='bob'));

select is(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  0::bigint,
  'un cliente no ve el historial de otro'
);

-- =====================================================================
-- 5. El historial no se puede manipular
-- =====================================================================
select tests.logout();
select tests.login_as((select v from fx where k='alice'));

-- Un editor que pudiera borrar versiones podría tapar lo que hizo.
select throws_ok(
  'delete from public.post_revisions',
  '42501', null,
  'ni el OWNER puede borrar versiones del historial'
);

select throws_ok(
  'update public.post_revisions set title = ''Reescrito''',
  '42501', null,
  'ni el OWNER puede reescribir una versión'
);

select throws_ok(
  format(
    'insert into public.post_revisions (post_id, tenant_id, version, title, slug, content_json, content_html, status)
     values (%L, %L, 999, ''Falsa'', ''falsa'', ''{}''::jsonb, '''', ''DRAFT'')',
    (select (ids->>'post')::uuid from seeded where tenant='A'),
    (select v from fx where k='tenantA')
  ),
  '42501', null,
  'no se pueden fabricar versiones a mano'
);

-- Contraprueba: el historial propio SÍ se lee.
select cmp_ok(
  (select count(*) from public.post_revisions
   where post_id = (select (ids->>'post')::uuid from seeded where tenant='A')),
  '>', 0::bigint,
  'el propio equipo sí ve su historial'
);

select tests.logout();
select * from finish();
rollback;
