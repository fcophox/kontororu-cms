-- =====================================================================
-- Kontorōru CMS — Row Level Security
-- Modelo: 1 base de datos, aislamiento lógico estricto por tenant_id.
--
-- Reglas de oro:
--   1. TODA tabla con tenant_id tiene RLS habilitada + FORCE.
--   2. Las funciones helper son SECURITY DEFINER + STABLE → no recursan
--      contra las políticas y el planner las cachea como InitPlan.
--   3. Se envuelven en (select fn()) para que Postgres las evalúe UNA vez
--      por query en lugar de una vez por fila.
--   4. La API pública NO usa RLS anónima: pasa por route handlers que
--      validan la API Key y aplican tenant_id explícitamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_superadmin from public.users_profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.user_tenant_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(tu.tenant_id), '{}')
  from public.tenant_users tu
  where tu.user_id = auth.uid();
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles tenant_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = p_tenant
      and tu.role = any (p_roles)
  );
$$;

/**
 * ¿Estamos en un contexto de plataforma en lugar de una petición de usuario?
 *
 * Dos casos: conexión SQL directa (migraciones, seed, psql, worker) donde no
 * hay JWT, o una petición con service_role. Ambos ya son privilegiados: el
 * primero es acceso directo a la base, el segundo bypassea RLS por definición.
 *
 * Existe porque los triggers de blindaje de columnas, aplicados sin excepción,
 * hacían imposible arrancar el sistema: revertían en silencio el UPDATE que
 * marca al primer SuperAdmin, dejando a Rukma Studio sin forma de crear su
 * propio equipo. Un `if not is_superadmin()` sólo funciona si YA existe uno.
 */
create or replace function public.is_platform_context()
returns boolean
language plpgsql stable as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  -- Sin JWT: conexión SQL directa, no una petición de la API.
  if v_claims is null or v_claims = '' then
    return true;
  end if;
  return coalesce((v_claims::jsonb) ->> 'role', '') = 'service_role';
exception
  when others then
    -- Claims presentes pero ilegibles: tratar como petición de usuario.
    return false;
end;
$$;

-- Azúcar sintáctico legible en las políticas
create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean language sql stable as $$
  select p_tenant = any (public.user_tenant_ids());
$$;

create or replace function public.is_tenant_manager(p_tenant uuid)
returns boolean language sql stable as $$
  select public.has_tenant_role(p_tenant, array['OWNER','ADMIN']::tenant_role[]);
$$;

revoke execute on function public.is_superadmin()       from public;
revoke execute on function public.user_tenant_ids()     from public;
revoke execute on function public.has_tenant_role(uuid, tenant_role[]) from public;
grant  execute on function public.is_superadmin()       to authenticated;
grant  execute on function public.user_tenant_ids()     to authenticated;
grant  execute on function public.has_tenant_role(uuid, tenant_role[]) to authenticated;
grant  execute on function public.is_tenant_member(uuid)  to authenticated;
grant  execute on function public.is_platform_context()    to authenticated;
grant  execute on function public.is_tenant_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ENABLE + FORCE
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users_profiles','tenant_users','categories','tags',
    'posts','post_tags','media','api_keys','webhooks',
    'webhook_deliveries','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- GRANTS
-- RLS filtra filas, pero GRANT decide si la tabla es alcanzable siquiera.
-- Se declaran explícitamente en lugar de confiar en los default privileges
-- del proyecto: si alguien los altera, las políticas seguirían siendo
-- correctas y la app dejaría de funcionar por una razón no obvia.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.tenants, public.users_profiles, public.tenant_users,
  public.categories, public.tags, public.posts, public.post_tags,
  public.media, public.api_keys, public.webhooks
  to authenticated;

grant select on public.webhook_deliveries, public.audit_logs to authenticated;

-- La API pública no consulta como `anon`: pasa por route handlers con
-- service_role tras validar la API Key. `anon` no toca datos de negocio.
revoke all on all tables in schema public from anon;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------
create policy tenants_select on public.tenants for select to authenticated
  using ( (select public.is_superadmin()) or id in (select unnest(public.user_tenant_ids())) );

-- Alta/baja de clientes: exclusivo Rukma Studio
create policy tenants_insert on public.tenants for insert to authenticated
  with check ( (select public.is_superadmin()) );

create policy tenants_delete on public.tenants for delete to authenticated
  using ( (select public.is_superadmin()) );

-- El Client Admin puede actualizar SU tenant (branding), no su plan/estado.
-- El bloqueo de columnas sensibles se hace con un trigger, no con RLS.
create policy tenants_update on public.tenants for update to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(id) );

create or replace function public.tg_protect_tenant_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_superadmin() or public.is_platform_context() then
    return new;
  end if;
  -- Campos reservados a Rukma Studio
  new.plan                := old.plan;
  new.status              := old.status;
  new.limits              := old.limits;
  new.slug                := old.slug;
  new.db_mode             := old.db_mode;
  new.external_db_url     := old.external_db_url;
  new.external_db_key_ref := old.external_db_key_ref;
  new.storage_provider    := old.storage_provider;
  new.storage_bucket      := old.storage_bucket;
  new.deleted_at          := old.deleted_at;
  return new;
end;
$$;
create trigger tenants_protect_columns before update on public.tenants
  for each row execute function public.tg_protect_tenant_columns();

-- ---------------------------------------------------------------------
-- USERS_PROFILES
-- ---------------------------------------------------------------------
create policy profiles_select_self on public.users_profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_superadmin())
    -- visible para compañeros del mismo tenant
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = users_profiles.id
        and tu.tenant_id in (select unnest(public.user_tenant_ids()))
    )
  );

create policy profiles_update_self on public.users_profiles for update to authenticated
  using ( id = (select auth.uid()) or (select public.is_superadmin()) )
  with check ( id = (select auth.uid()) or (select public.is_superadmin()) );

-- Nadie se auto-promueve a SuperAdmin desde el cliente.
create or replace function public.tg_protect_superadmin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_superadmin() or public.is_platform_context()) then
    new.is_superadmin := old.is_superadmin;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_superadmin before update on public.users_profiles
  for each row execute function public.tg_protect_superadmin_flag();

-- ---------------------------------------------------------------------
-- TENANT_USERS  (gestión de colaboradores → OWNER/ADMIN)
-- ---------------------------------------------------------------------
create policy tenant_users_select on public.tenant_users for select to authenticated
  using ( (select public.is_superadmin()) or tenant_id in (select unnest(public.user_tenant_ids())) );

create policy tenant_users_write on public.tenant_users for insert to authenticated
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

create policy tenant_users_update on public.tenant_users for update to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

create policy tenant_users_delete on public.tenant_users for delete to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

-- ---------------------------------------------------------------------
-- CATEGORIES / TAGS  (lectura: todo el tenant · escritura: OWNER/ADMIN/EDITOR)
-- ---------------------------------------------------------------------
create policy categories_select on public.categories for select to authenticated
  using ( (select public.is_superadmin()) or tenant_id in (select unnest(public.user_tenant_ids())) );

create policy categories_write on public.categories for all to authenticated
  using (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
  )
  with check (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
  );

create policy tags_select on public.tags for select to authenticated
  using ( (select public.is_superadmin()) or tenant_id in (select unnest(public.user_tenant_ids())) );

create policy tags_write on public.tags for all to authenticated
  using (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR','CONTRIBUTOR']::tenant_role[])
  )
  with check (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR','CONTRIBUTOR']::tenant_role[])
  );

-- ---------------------------------------------------------------------
-- POSTS
--   OWNER/ADMIN/EDITOR : control total dentro del tenant
--   CONTRIBUTOR        : sólo crea/edita SUS borradores, nunca publica
-- ---------------------------------------------------------------------
create policy posts_select on public.posts for select to authenticated
  using ( (select public.is_superadmin()) or tenant_id in (select unnest(public.user_tenant_ids())) );

create policy posts_insert on public.posts for insert to authenticated
  with check (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
    or (
      public.has_tenant_role(tenant_id, array['CONTRIBUTOR']::tenant_role[])
      and author_id = (select auth.uid())
      and status = 'DRAFT'
    )
  );

create policy posts_update on public.posts for update to authenticated
  using (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
    or (
      public.has_tenant_role(tenant_id, array['CONTRIBUTOR']::tenant_role[])
      and author_id = (select auth.uid())
      and status = 'DRAFT'
    )
  )
  with check (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
    or (
      public.has_tenant_role(tenant_id, array['CONTRIBUTOR']::tenant_role[])
      and author_id = (select auth.uid())
      and status = 'DRAFT'
    )
  );

create policy posts_delete on public.posts for delete to authenticated
  using (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN']::tenant_role[])
  );

create policy post_tags_all on public.post_tags for all to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_tags.post_id
        and ( (select public.is_superadmin()) or p.tenant_id in (select unnest(public.user_tenant_ids())) )
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_tags.post_id
        and ( (select public.is_superadmin()) or p.tenant_id in (select unnest(public.user_tenant_ids())) )
    )
  );

-- ---------------------------------------------------------------------
-- MEDIA
-- ---------------------------------------------------------------------
create policy media_select on public.media for select to authenticated
  using ( (select public.is_superadmin()) or tenant_id in (select unnest(public.user_tenant_ids())) );

create policy media_insert on public.media for insert to authenticated
  with check ( (select public.is_superadmin()) or public.is_tenant_member(tenant_id) );

create policy media_update on public.media for update to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_member(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_member(tenant_id) );

create policy media_delete on public.media for delete to authenticated
  using (
    (select public.is_superadmin())
    or public.has_tenant_role(tenant_id, array['OWNER','ADMIN','EDITOR']::tenant_role[])
    or uploaded_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- API KEYS  (sólo OWNER/ADMIN · el hash nunca se expone al cliente:
--            se consulta vía vista/RPC que omite key_hash)
-- ---------------------------------------------------------------------
create policy api_keys_manage on public.api_keys for all to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

create view public.api_keys_public
with (security_invoker = true) as
  select id, tenant_id, name, key_prefix, scopes,
         last_used_at, expires_at, revoked_at, created_by, created_at
  from public.api_keys;

grant select on public.api_keys_public to authenticated;
revoke all on public.api_keys_public from anon;

-- ---------------------------------------------------------------------
-- WEBHOOKS
-- ---------------------------------------------------------------------
create policy webhooks_manage on public.webhooks for all to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

-- ---------------------------------------------------------------------
-- AUDIT LOGS  (append-only desde el servidor; lectura para managers)
-- ---------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

-- ---------------------------------------------------------------------
-- STORAGE — bucket único, aislamiento por prefijo <tenant_id>/
-- (Supabase limita el nº de buckets; el prefijo escala a miles de tenants
--  y permite mover el bucket a S3/R2 sin migrar rutas.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tenant-media', 'tenant-media', false)
on conflict (id) do nothing;

create policy "tenant media read" on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-media'
    and (storage.foldername(name))[1]::uuid in (select unnest(public.user_tenant_ids()))
  );

create policy "tenant media insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-media'
    and (storage.foldername(name))[1]::uuid in (select unnest(public.user_tenant_ids()))
  );

create policy "tenant media update" on storage.objects for update to authenticated
  using (
    bucket_id = 'tenant-media'
    and (storage.foldername(name))[1]::uuid in (select unnest(public.user_tenant_ids()))
  );

create policy "tenant media delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-media'
    and (storage.foldername(name))[1]::uuid in (select unnest(public.user_tenant_ids()))
  );
