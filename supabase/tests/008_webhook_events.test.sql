-- =====================================================================
-- TEST: eventos de webhook de categorías y archivos
--
-- Estos dos eventos llevaban desde el esquema inicial declarados en el enum y
-- ofrecidos en el panel sin que nada los emitiera: un cliente se suscribía a
-- "Categoría modificada" y no recibía un aviso en su vida. No saltaba ningún
-- error, que es lo que lo hizo durar — un trigger que no emite y un endpoint
-- que no escucha se ven exactamente igual desde el CMS.
--
-- Por eso se comprueba aquí que emiten, pero sobre todo que emiten SÓLO
-- cuando toca: a quien está suscrito, con el webhook activo, del tenant
-- correcto, y no ante un UPDATE que no cambia nada publicable.
-- =====================================================================
\ir helpers.psql

begin;
select no_plan();

create temporary table fx (k text primary key, v uuid);
grant select on fx to public;

insert into fx (k, v) values
  ('alice',  tests.create_user('alice@rukma.studio')),
  ('bob',    tests.create_user('bob@acme.com'));

insert into fx (k, v) values
  ('tenantA', tests.create_tenant('rukma-ev', 'Rukma Eventos')),
  ('tenantB', tests.create_tenant('acme-ev',  'ACME Eventos'));

-- Un webhook suscrito a los dos eventos nuevos en A, y otro en B para
-- comprobar que las entregas no se cruzan entre clientes.
insert into public.webhooks (id, tenant_id, name, url, events)
values (
  '11111111-1111-1111-1111-111111111111',
  (select v from fx where k = 'tenantA'),
  'A suscrito', 'https://a.example/hook',
  array['category.updated','media.deleted']::webhook_event[]
), (
  '22222222-2222-2222-2222-222222222222',
  (select v from fx where k = 'tenantB'),
  'B suscrito', 'https://b.example/hook',
  array['category.updated','media.deleted']::webhook_event[]
);

-- Suscrito sólo a contenido: no debe recibir NADA de lo de aquí.
insert into public.webhooks (id, tenant_id, name, url, events)
values (
  '33333333-3333-3333-3333-333333333333',
  (select v from fx where k = 'tenantA'),
  'A sólo contenido', 'https://a2.example/hook',
  array['post.published']::webhook_event[]
);

-- Suscrito pero apagado: tampoco.
insert into public.webhooks (id, tenant_id, name, url, events, is_active)
values (
  '44444444-4444-4444-4444-444444444444',
  (select v from fx where k = 'tenantA'),
  'A apagado', 'https://a3.example/hook',
  array['category.updated','media.deleted']::webhook_event[], false
);

-- Todas las filas de esta transacción comparten `created_at` —`now()` es el
-- instante de la transacción, no el de la sentencia—, así que "la última
-- entrega" no existe: ordenar por fecha devuelve una cualquiera entre empates.
-- Por eso cada fase vacía la cola antes de la siguiente y las aserciones miran
-- siempre una sola fila.
create or replace function tests.deliveries(p_event text, p_hook uuid)
returns bigint language sql as $$
  select count(*) from public.webhook_deliveries
  where event = p_event::webhook_event and webhook_id = p_hook;
$$;

-- ---------------------------------------------------------------------
-- Alta de categoría
-- ---------------------------------------------------------------------
insert into public.categories (id, tenant_id, slug, name)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        (select v from fx where k = 'tenantA'), 'guias', 'Guías');

select is(
  tests.deliveries('category.updated', '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'crear una categoría encola category.updated al webhook suscrito'
);

select is(
  tests.deliveries('category.updated', '33333333-3333-3333-3333-333333333333'),
  0::bigint,
  'un webhook no suscrito a category.updated no recibe nada'
);

select is(
  tests.deliveries('category.updated', '44444444-4444-4444-4444-444444444444'),
  0::bigint,
  'un webhook apagado no recibe aunque esté suscrito'
);

select is(
  tests.deliveries('category.updated', '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'el webhook de otro tenant no recibe la categoría ajena'
);

delete from public.webhook_deliveries;

-- ---------------------------------------------------------------------
-- UPDATE que no cambia nada publicable
-- ---------------------------------------------------------------------
update public.categories set updated_at = now()
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  tests.deliveries('category.updated', '11111111-1111-1111-1111-111111111111'),
  0::bigint,
  'tocar sólo updated_at NO emite: la web no tiene nada que revalidar'
);

-- ---------------------------------------------------------------------
-- Renombrado: el slug viejo tiene que viajar
-- ---------------------------------------------------------------------
update public.categories set slug = 'tutoriales'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  tests.deliveries('category.updated', '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'cambiar el slug sí emite'
);

select is(
  (select payload->'data'->>'previousSlug' from public.webhook_deliveries
   where webhook_id = '11111111-1111-1111-1111-111111111111'),
  'guias',
  'el payload lleva previousSlug para invalidar también la dirección vieja'
);

select is(
  (select payload->'data'->>'slug' from public.webhook_deliveries
   where webhook_id = '11111111-1111-1111-1111-111111111111'),
  'tutoriales',
  'y el slug nuevo'
);

delete from public.webhook_deliveries;

-- ---------------------------------------------------------------------
-- Borrado de categoría
-- ---------------------------------------------------------------------
delete from public.categories where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select payload->'data'->>'isDeleted' from public.webhook_deliveries
   where webhook_id = '11111111-1111-1111-1111-111111111111'),
  'true',
  'borrar una categoría emite con isDeleted en true'
);

delete from public.webhook_deliveries;

-- ---------------------------------------------------------------------
-- media.deleted
-- ---------------------------------------------------------------------
-- La ruta tiene que empezar por el tenant_id: `media_path_tenant_prefix` lo
-- exige para que un archivo no pueda colarse en el espacio de otro cliente.
insert into public.media (id, tenant_id, bucket, path, mime_type, size_bytes)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        (select v from fx where k = 'tenantA'),
        'media',
        (select v from fx where k = 'tenantA') || '/foto.jpg',
        'image/jpeg', 1024);

select is(
  tests.deliveries('media.deleted', '11111111-1111-1111-1111-111111111111'),
  0::bigint,
  'subir un archivo no emite: nadie lo referencia todavía'
);

delete from public.media where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select is(
  tests.deliveries('media.deleted', '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'borrar un archivo emite media.deleted'
);

select is(
  (select payload->'data'->>'path' from public.webhook_deliveries
   where event = 'media.deleted'),
  (select v from fx where k = 'tenantA') || '/foto.jpg',
  'el payload lleva la ruta, que es con lo que se purga la caché del CDN'
);

select * from finish();
rollback;
