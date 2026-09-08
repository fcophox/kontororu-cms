-- =====================================================================
-- Eventos de webhook para categorías y archivos borrados.
--
-- El hueco: `category.updated` y `media.deleted` estaban en el enum desde el
-- esquema inicial y el panel los ofrecía como casillas, pero NADA los emitía.
-- Un cliente podía suscribirse a "Categoría modificada" y no recibir un solo
-- aviso en su vida, sin ningún error que lo delatara — el mismo silencio que
-- tenía la disponibilidad del Calendario antes de `20260818000100`, sólo que
-- al revés: allí el evento existía y nadie escuchaba; aquí alguien escuchaba
-- un evento que nadie emitía.
--
-- Van en la BASE y no en las Server Actions por la misma razón que el de
-- complementos: una categoría se toca desde su pantalla, desde el editor de
-- contenido y desde soporte. Un trigger cubre los tres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- category.updated
-- ---------------------------------------------------------------------
create or replace function public.tg_enqueue_category_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row     public.categories%rowtype;
  v_hook    record;
  v_payload jsonb;
begin
  v_row := coalesce(new, old);

  -- Sólo es noticia lo que cambia lo que la API devuelve. Un UPDATE que deja
  -- igual todo lo publicable —un `updated_at` al guardar sin tocar nada— haría
  -- revalidar a la web sin motivo.
  if tg_op = 'UPDATE'
     and old.slug        is not distinct from new.slug
     and old.name        is not distinct from new.name
     and old.kind        is not distinct from new.kind
     and old.description is not distinct from new.description
     and old.position    is not distinct from new.position
     and old.parent_id   is not distinct from new.parent_id
     and old.seo         is not distinct from new.seo then
    return v_row;
  end if;

  -- El payload identifica la categoría, no la reproduce: es un aviso de
  -- "esto cambió, vuelve a pedirlo", igual que el resto.
  --
  -- `previousSlug` sólo aparece cuando el slug cambia, y existe porque quien
  -- cachea por slug necesita invalidar TAMBIÉN la dirección vieja. Sin él, un
  -- renombrado deja la página anterior servida indefinidamente: el consumidor
  -- revalida la nueva, que no tenía nada guardado, y nunca toca la que sí.
  v_payload := jsonb_build_object(
    'event',      'category.updated',
    'tenantId',   v_row.tenant_id,
    'occurredAt', now(),
    'data', jsonb_build_object(
      'id',        v_row.id,
      'slug',      v_row.slug,
      'kind',      v_row.kind,
      'isDeleted', tg_op = 'DELETE'
    )
    || case
         when tg_op = 'UPDATE' and old.slug is distinct from new.slug
         then jsonb_build_object('previousSlug', old.slug)
         else '{}'::jsonb
       end
  );

  for v_hook in
    select id from public.webhooks
    where tenant_id = v_row.tenant_id
      and is_active
      and 'category.updated' = any (events)
  loop
    insert into public.webhook_deliveries (webhook_id, tenant_id, event, payload)
    values (v_hook.id, v_row.tenant_id, 'category.updated', v_payload);
  end loop;

  return v_row;
end;
$$;

drop trigger if exists categories_enqueue_events on public.categories;

create trigger categories_enqueue_events
  after insert or update or delete on public.categories
  for each row execute function public.tg_enqueue_category_event();

-- ---------------------------------------------------------------------
-- media.deleted
--
-- Sólo el borrado. Subir un archivo no cambia nada de lo que la web ya sirve
-- —nadie lo referencia todavía—, y editar el `alt_text` viaja dentro del
-- contenido que lo usa, que ya emite su propio `post.updated`. Borrar sí es
-- noticia: deja una URL colgando que la web puede tener cacheada.
-- ---------------------------------------------------------------------
create or replace function public.tg_enqueue_media_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hook    record;
  v_payload jsonb;
begin
  -- `bucket` y `path` van en el payload porque son con lo que se construye la
  -- URL pública: quien purga una caché de CDN necesita la ruta, no el id.
  v_payload := jsonb_build_object(
    'event',      'media.deleted',
    'tenantId',   old.tenant_id,
    'occurredAt', now(),
    'data', jsonb_build_object(
      'id',     old.id,
      'bucket', old.bucket,
      'path',   old.path
    )
  );

  for v_hook in
    select id from public.webhooks
    where tenant_id = old.tenant_id
      and is_active
      and 'media.deleted' = any (events)
  loop
    insert into public.webhook_deliveries (webhook_id, tenant_id, event, payload)
    values (v_hook.id, old.tenant_id, 'media.deleted', v_payload);
  end loop;

  return old;
end;
$$;

drop trigger if exists media_enqueue_events on public.media;

create trigger media_enqueue_events
  after delete on public.media
  for each row execute function public.tg_enqueue_media_event();

-- ---------------------------------------------------------------------
-- Suscribe a los webhooks que ya existían, igual que hizo
-- `20260818000200` con `addon.updated`.
--
-- Mismo razonamiento y misma contrapartida: a esos endpoints empezarán a
-- llegarles entregas de dos tipos que no esperaban. Es seguro porque el
-- payload comparte la forma de todos los demás y va firmado igual, así que
-- un receptor que mire `event` los ignora sin enterarse.
-- ---------------------------------------------------------------------
update public.webhooks
set events = events || 'category.updated'::webhook_event
where not ('category.updated' = any (events));

update public.webhooks
set events = events || 'media.deleted'::webhook_event
where not ('media.deleted' = any (events));
