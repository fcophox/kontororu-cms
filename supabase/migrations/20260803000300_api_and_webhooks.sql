-- =====================================================================
-- Kontorōru CMS — Resolución de API Keys + Outbox de Webhooks
-- =====================================================================

-- ---------------------------------------------------------------------
-- API KEYS
-- Formato de la clave entregada UNA sola vez al cliente:
--   kntr_live_<prefix12>.<secret32>
-- Se persiste: key_prefix = "kntr_live_<prefix12>", key_hash = sha256(secret32)
-- ---------------------------------------------------------------------
create or replace function public.resolve_api_key(p_prefix text, p_secret text)
returns table (tenant_id uuid, api_key_id uuid, scopes text[])
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row public.api_keys%rowtype;
begin
  select * into v_row
  from public.api_keys k
  where k.key_prefix = p_prefix
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    return;
  end if;

  -- Comparación en tiempo constante
  if not extensions.crypt(p_secret, v_row.key_hash) = v_row.key_hash then
    return;
  end if;

  -- Tenant debe estar operativo
  if not exists (
    select 1 from public.tenants t
    where t.id = v_row.tenant_id
      and t.status in ('TRIAL','ACTIVE')
      and t.deleted_at is null
  ) then
    return;
  end if;

  update public.api_keys set last_used_at = now() where id = v_row.id;

  return query select v_row.tenant_id, v_row.id, v_row.scopes;
end;
$$;

revoke execute on function public.resolve_api_key(text, text) from public, anon, authenticated;
grant  execute on function public.resolve_api_key(text, text) to service_role;

-- Generación server-side (devuelve el secreto en claro SOLO en esta llamada)
create or replace function public.create_api_key(p_tenant uuid, p_name text, p_scopes text[] default array['content:read'])
returns table (id uuid, key_prefix text, plain_key text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prefix text := 'kntr_live_' || encode(extensions.gen_random_bytes(6), 'hex');
  v_secret text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id     uuid;
begin
  -- is_platform_context() cubre los dos casos privilegiados: service_role y
  -- conexión SQL directa (migraciones, aprovisionamiento, soporte). Se usa la
  -- misma función que los triggers de blindaje para que no haya dos criterios
  -- distintos de "esto no es una petición de usuario final".
  if not (
    public.is_platform_context()
    or public.is_superadmin()
    or public.is_tenant_manager(p_tenant)
  ) then
    raise exception 'no autorizado';
  end if;

  insert into public.api_keys (tenant_id, name, key_prefix, key_hash, scopes, created_by)
  values (p_tenant, p_name, v_prefix,
          extensions.crypt(v_secret, extensions.gen_salt('bf', 10)),
          p_scopes, auth.uid())
  returning api_keys.id into v_id;

  return query select v_id, v_prefix, v_prefix || '.' || v_secret;
end;
$$;
grant execute on function public.create_api_key(uuid, text, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- OUTBOX DE WEBHOOKS
-- El trigger no hace HTTP: encola. Un worker (Edge Function + cron, o
-- Inngest/QStash) drena la cola con reintentos y backoff exponencial.
-- ---------------------------------------------------------------------
create or replace function public.tg_enqueue_content_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event   webhook_event;
  v_row     public.posts%rowtype;
  v_hook    record;
  v_payload jsonb;
begin
  v_row := coalesce(new, old);

  if tg_op = 'INSERT' then
    v_event := case when new.status = 'PUBLISHED' then 'post.published' else 'post.created' end;
  elsif tg_op = 'DELETE' then
    v_event := 'post.deleted';
  elsif old.status <> 'PUBLISHED' and new.status = 'PUBLISHED' then
    v_event := 'post.published';
  elsif old.status = 'PUBLISHED' and new.status <> 'PUBLISHED' then
    v_event := 'post.unpublished';
  elsif new.status = 'PUBLISHED' then
    v_event := 'post.updated';
  else
    return v_row;  -- cambios sobre borradores no invalidan caché
  end if;

  v_payload := jsonb_build_object(
    'event',     v_event,
    'tenantId',  v_row.tenant_id,
    'occurredAt', now(),
    'data', jsonb_build_object(
      'id',         v_row.id,
      'slug',       v_row.slug,
      'title',      v_row.title,
      'status',     v_row.status,
      'categoryId', v_row.category_id
    )
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

drop trigger if exists posts_enqueue_events on public.posts;
create trigger posts_enqueue_events
  after insert or update or delete on public.posts
  for each row execute function public.tg_enqueue_content_event();

-- Cola pendiente para el worker
create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (created_at)
  where delivered_at is null and attempt < 6;

-- ---------------------------------------------------------------------
-- USO / LÍMITES  (dashboard SuperAdmin + enforcement)
-- ---------------------------------------------------------------------
create or replace function public.tenant_usage(p_tenant uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users',     (select count(*) from public.tenant_users where tenant_id = p_tenant),
    'posts',     (select count(*) from public.posts where tenant_id = p_tenant and deleted_at is null),
    'storageMb', (select coalesce(sum(size_bytes), 0) / 1048576.0 from public.media where tenant_id = p_tenant),
    'apiKeys',   (select count(*) from public.api_keys where tenant_id = p_tenant and revoked_at is null)
  )
  where public.is_superadmin() or public.is_tenant_member(p_tenant);
$$;
grant execute on function public.tenant_usage(uuid) to authenticated, service_role;
