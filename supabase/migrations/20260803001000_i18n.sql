-- =====================================================================
-- Multi-idioma
--
-- MODELO: grupo de traducción. Cada idioma es una FILA COMPLETA de `posts`,
-- y las versiones de un mismo contenido comparten `translation_group_id`.
--
-- La alternativa —un JSONB con {es: "...", en: "..."} por campo— parece más
-- compacta y es peor para lo que de verdad importa aquí:
--
--   · SEO. Cada idioma necesita su propia URL, su propio título y su propia
--     meta descripción. Con JSONB no hay slug por idioma: no hay hreflang.
--   · Flujo editorial. La traducción al inglés puede estar en borrador
--     mientras la española lleva un mes publicada. Con un JSONB por campo,
--     `status` es uno solo y publicar publica todo.
--   · Consultas. Filtrar y ordenar por un campo dentro de un JSONB no usa
--     los índices que ya existen.
--
-- El precio es que un contenido en tres idiomas son tres filas. Es el precio
-- correcto: son tres páginas distintas de cara al mundo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Idiomas del tenant
-- ---------------------------------------------------------------------
alter table public.tenants
  add column default_locale text not null default 'es',
  add column locales text[] not null default array['es'];

comment on column public.tenants.locales is
  'Idiomas activos. El primero no es el principal: eso lo dice default_locale.';

alter table public.tenants
  add constraint tenants_default_locale_in_locales
  check (default_locale = any (locales));

-- BCP-47 abreviado: `es`, `en`, `pt-BR`. Sin esto acabarían conviviendo
-- "en", "EN" y "en_US" para el mismo idioma.
--
-- Va en una función porque un CHECK no admite subconsultas, y validar cada
-- elemento de un array necesita `unnest`. IMMUTABLE es obligatorio para que
-- Postgres la acepte dentro de un constraint.
create or replace function public.locales_are_valid(p_locales text[])
returns boolean
language sql immutable as $$
  select p_locales is not null
     and cardinality(p_locales) > 0
     and bool_and(l ~ '^[a-z]{2}(-[A-Z]{2})?$')
  from unnest(p_locales) l;
$$;

alter table public.tenants
  add constraint tenants_locales_format
  check (public.locales_are_valid(locales));

-- ---------------------------------------------------------------------
-- Contenido
-- ---------------------------------------------------------------------
alter table public.posts
  add column locale text not null default 'es',
  -- Por defecto cada contenido existente es su propio grupo: es la
  -- traducción única de sí mismo.
  add column translation_group_id uuid not null default gen_random_uuid();

alter table public.categories
  add column locale text not null default 'es',
  add column translation_group_id uuid not null default gen_random_uuid();

/*
 * El slug pasa a ser único POR IDIOMA.
 *
 * Sin este cambio, /sobre-nosotros en español impediría tener /sobre-nosotros
 * en gallego — y peor: dos traducciones que coincidieran en slug (habitual
 * entre es/pt) chocarían al guardar.
 */
alter table public.posts drop constraint posts_tenant_id_slug_key;
alter table public.posts add constraint posts_tenant_locale_slug_key
  unique (tenant_id, locale, slug);

alter table public.categories drop constraint categories_tenant_id_slug_key;
alter table public.categories add constraint categories_tenant_locale_slug_key
  unique (tenant_id, locale, slug);

-- Un grupo no puede tener dos veces el mismo idioma: sería ambiguo cuál es
-- "la versión en inglés".
create unique index if not exists posts_group_locale_key
  on public.posts (translation_group_id, locale);
create unique index if not exists categories_group_locale_key
  on public.categories (translation_group_id, locale);

create index if not exists posts_tenant_locale_idx on public.posts (tenant_id, locale, status);
create index if not exists categories_tenant_locale_idx on public.categories (tenant_id, locale);

-- ---------------------------------------------------------------------
-- Coherencia
-- ---------------------------------------------------------------------
/**
 * El idioma tiene que estar activo en el tenant.
 *
 * No se puede expresar con un CHECK porque mira otra tabla. Va en trigger
 * para que ningún camino de escritura —API, script, psql— pueda crear
 * contenido en un idioma que el cliente no tiene configurado y que, por
 * tanto, su web no sabría servir.
 */
create or replace function public.tg_assert_locale_enabled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_locales text[];
begin
  select locales into v_locales from public.tenants where id = new.tenant_id;

  if not (new.locale = any (v_locales)) then
    raise exception 'El idioma "%" no está activado en este espacio', new.locale
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_assert_locale on public.posts;
create trigger posts_assert_locale
  before insert or update of locale on public.posts
  for each row execute function public.tg_assert_locale_enabled();

drop trigger if exists categories_assert_locale on public.categories;
create trigger categories_assert_locale
  before insert or update of locale on public.categories
  for each row execute function public.tg_assert_locale_enabled();

/**
 * Un post sólo puede clasificarse en una categoría de SU idioma.
 *
 * Sin esto, el artículo inglés acabaría colgando de "Casos de Estudio" en
 * español y la web del cliente mostraría un breadcrumb mezclado.
 */
create or replace function public.tg_assert_category_locale()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_locale text;
begin
  if new.category_id is null then
    return new;
  end if;

  select locale into v_locale from public.categories where id = new.category_id;

  if v_locale is distinct from new.locale then
    raise exception 'La categoría está en "%" y el contenido en "%"', v_locale, new.locale
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_assert_category_locale on public.posts;
create trigger posts_assert_category_locale
  before insert or update on public.posts
  for each row execute function public.tg_assert_category_locale();

-- ---------------------------------------------------------------------
-- El historial también guarda el idioma
-- ---------------------------------------------------------------------
alter table public.post_revisions add column locale text not null default 'es';

create or replace function public.tg_capture_post_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
begin
  if tg_op = 'UPDATE' and not (
    new.title         is distinct from old.title or
    new.slug          is distinct from old.slug or
    new.excerpt       is distinct from old.excerpt or
    new.content_json  is distinct from old.content_json or
    new.custom_fields is distinct from old.custom_fields or
    new.seo           is distinct from old.seo or
    new.category_id   is distinct from old.category_id
  ) then
    return new;
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.post_revisions where post_id = new.id;

  insert into public.post_revisions (
    post_id, tenant_id, version, title, slug, excerpt,
    content_json, content_html, custom_fields, seo, category_id, status, locale, created_by
  ) values (
    new.id, new.tenant_id, v_next, new.title, new.slug, new.excerpt,
    new.content_json, new.content_html, new.custom_fields, new.seo,
    new.category_id, new.status, new.locale, auth.uid()
  );

  delete from public.post_revisions
  where post_id = new.id
    and version <= v_next - 30;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Los webhooks avisan del idioma y de las traducciones hermanas
-- ---------------------------------------------------------------------
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
    if old.deleted_at is not null then
      return v_row;
    end if;
    v_event := 'post.deleted';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_event := 'post.deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_event := case when new.status = 'PUBLISHED' then 'post.published' else 'post.created' end;
  elsif new.deleted_at is not null then
    return v_row;
  elsif old.status <> 'PUBLISHED' and new.status = 'PUBLISHED' then
    v_event := 'post.published';
  elsif old.status = 'PUBLISHED' and new.status <> 'PUBLISHED' then
    v_event := 'post.unpublished';
  elsif new.status = 'PUBLISHED' then
    v_event := 'post.updated';
  else
    return v_row;
  end if;

  v_data := jsonb_build_object(
    'id',         v_row.id,
    'slug',       v_row.slug,
    'title',      v_row.title,
    'status',     v_row.status,
    'categoryId', v_row.category_id,
    'locale',     v_row.locale
  );

  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    v_data := v_data || jsonb_build_object('previousSlug', old.slug);
  end if;

  -- La web del cliente necesita saber qué OTRAS URLs se ven afectadas: el
  -- selector de idioma y las etiquetas hreflang de las traducciones apuntan
  -- a esta página, así que también hay que revalidarlas.
  v_data := v_data || jsonb_build_object(
    'translations',
    coalesce((
      select jsonb_object_agg(p.locale, p.slug)
      from public.posts p
      where p.translation_group_id = v_row.translation_group_id
        and p.id <> v_row.id
        and p.deleted_at is null
    ), '{}'::jsonb)
  );

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

-- ---------------------------------------------------------------------
-- La API necesita el idioma por defecto en cada petición
-- ---------------------------------------------------------------------
/*
 * Se añade a `resolve_api_key` en vez de consultarlo aparte: sin `?locale=`,
 * la API devuelve el idioma principal del cliente, y eso se decide en CADA
 * petición. Una consulta extra a `tenants` por request para leer un texto
 * corto no compensa cuando la resolución de la clave ya toca esa tabla.
 *
 * Devolver el idioma principal —y no todos— es lo que mantiene compatible a
 * quien ya consume la API: el día que active un segundo idioma, su listado no
 * empieza a mostrar cada artículo por duplicado.
 */
drop function if exists public.resolve_api_key(text, text);

create or replace function public.resolve_api_key(p_prefix text, p_secret text)
returns table (
  tenant_id uuid,
  api_key_id uuid,
  scopes text[],
  plan tenant_plan,
  default_locale text,
  locales text[]
)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row public.api_keys%rowtype;
  v_tenant public.tenants%rowtype;
begin
  select * into v_row
  from public.api_keys k
  where k.key_prefix = p_prefix
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    return;
  end if;

  if not extensions.crypt(p_secret, v_row.key_hash) = v_row.key_hash then
    return;
  end if;

  select * into v_tenant
  from public.tenants t
  where t.id = v_row.tenant_id
    and t.status in ('TRIAL', 'ACTIVE')
    and t.deleted_at is null;

  if not found then
    return;
  end if;

  update public.api_keys set last_used_at = now() where id = v_row.id;

  return query select
    v_row.tenant_id, v_row.id, v_row.scopes,
    v_tenant.plan, v_tenant.default_locale, v_tenant.locales;
end;
$$;

revoke execute on function public.resolve_api_key(text, text) from public, anon, authenticated;
grant execute on function public.resolve_api_key(text, text) to service_role;
