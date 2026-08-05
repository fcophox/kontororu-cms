-- =====================================================================
-- Eventos de webhook para papelera y cambio de URL.
--
-- Dos huecos que sólo se ven desde la web del cliente:
--
-- 1. SOFT DELETE. Mover a la papelera es un UPDATE que no toca `status`, así
--    que el trigger emitía `post.updated`. La API deja de devolver el
--    contenido inmediatamente, pero al cliente se le decía "actualizado":
--    su página quedaba en 404 sin que nada le avisara de retirarla.
--
-- 2. CAMBIO DE SLUG. El payload sólo llevaba el slug NUEVO. La página vieja
--    seguía publicada en su web para siempre, porque no tenía forma de saber
--    qué URL invalidar.
-- =====================================================================

create or replace function public.tg_enqueue_content_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event   webhook_event;
  v_row     public.posts%rowtype;
  v_hook    record;
  v_payload jsonb;
  v_data    jsonb;
begin
  v_row := coalesce(new, old);

  if tg_op = 'INSERT' then
    v_event := case when new.status = 'PUBLISHED' then 'post.published' else 'post.created' end;

  elsif tg_op = 'DELETE' then
    -- Vaciar la papelera NO es noticia: al entrar en ella ya se emitió
    -- `post.deleted` y la web del cliente retiró la página. Repetirlo le
    -- haría revalidar una URL que hace días que no existe.
    if old.deleted_at is not null then
      return v_row;
    end if;
    v_event := 'post.deleted';

  -- A la papelera: para el mundo exterior es una baja, no una edición.
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_event := 'post.deleted';

  -- Restaurado desde la papelera.
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_event := case when new.status = 'PUBLISHED' then 'post.published' else 'post.created' end;

  -- Ya estaba en la papelera: editarlo ahí no le importa a nadie fuera.
  elsif new.deleted_at is not null then
    return v_row;

  elsif old.status <> 'PUBLISHED' and new.status = 'PUBLISHED' then
    v_event := 'post.published';
  elsif old.status = 'PUBLISHED' and new.status <> 'PUBLISHED' then
    v_event := 'post.unpublished';
  elsif new.status = 'PUBLISHED' then
    v_event := 'post.updated';
  else
    return v_row;  -- cambios sobre borradores no invalidan caché
  end if;

  v_data := jsonb_build_object(
    'id',         v_row.id,
    'slug',       v_row.slug,
    'title',      v_row.title,
    'status',     v_row.status,
    'categoryId', v_row.category_id
  );

  -- Sin esto el cliente no puede invalidar la URL antigua.
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    v_data := v_data || jsonb_build_object('previousSlug', old.slug);
  end if;

  v_payload := jsonb_build_object(
    'event',      v_event,
    'tenantId',   v_row.tenant_id,
    'occurredAt', now(),
    'data',       v_data
  );

  for v_hook in
    select id from public.webhooks
    where tenant_id = v_row.tenant_id and is_active and v_event = any (events)
  loop
    insert into public.webhook_deliveries (webhook_id, tenant_id, event, payload)
    values (v_hook.id, v_row.tenant_id, v_event, v_payload);
  end loop;

  return v_row;
end;
$$;
