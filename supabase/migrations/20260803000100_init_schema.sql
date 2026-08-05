-- =====================================================================
-- Kontorōru CMS — Esquema base multi-tenant
-- Rukma Studio
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type tenant_status  as enum ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
create type tenant_plan    as enum ('FREE', 'PRO', 'ENTERPRISE');
create type tenant_db_mode as enum ('SHARED', 'DEDICATED');
create type tenant_role    as enum ('OWNER', 'ADMIN', 'EDITOR', 'CONTRIBUTOR');
create type content_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
create type category_kind  as enum ('BLOG', 'CASE_STUDY', 'SERVICE', 'CUSTOM');
create type storage_provider as enum ('SUPABASE', 'S3', 'R2');

create type webhook_event as enum (
  'post.created', 'post.published', 'post.updated',
  'post.unpublished', 'post.deleted',
  'category.updated', 'media.deleted'
);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique,
  name          text   not null,
  status        tenant_status not null default 'TRIAL',
  plan          tenant_plan   not null default 'FREE',

  -- Branding aplicado en runtime al dashboard (ver src/lib/theme)
  branding      jsonb not null default jsonb_build_object(
                  'logoUrl', null,
                  'faviconUrl', null,
                  'primary', '#111827',
                  'secondary', '#6366f1',
                  'radius', '0.625rem'
                ),

  -- Límites de uso por plan (enforced en app layer + triggers)
  limits        jsonb not null default jsonb_build_object(
                  'maxUsers', 3,
                  'maxPosts', 100,
                  'maxStorageMb', 1024,
                  'maxApiKeys', 2
                ),

  -- Arquitectura híbrida: Enterprise puede apuntar a su propio Supabase.
  -- NUNCA se guarda la service key en claro: se referencia Supabase Vault.
  db_mode              tenant_db_mode not null default 'SHARED',
  external_db_url      text,
  external_db_key_ref  uuid, -- vault.secrets.id

  storage_provider     storage_provider not null default 'SUPABASE',
  storage_bucket       text not null default 'tenant-media',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint tenants_dedicated_requires_url check (
    db_mode = 'SHARED' or (external_db_url is not null and external_db_key_ref is not null)
  )
);
create index tenants_status_idx on public.tenants (status) where deleted_at is null;
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- USERS PROFILES  (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.users_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext not null,
  full_name     text,
  avatar_url    text,
  -- SuperAdmin = staff de Rukma Studio. Bypassea el aislamiento por tenant.
  is_superadmin boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger users_profiles_updated_at before update on public.users_profiles
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ---------------------------------------------------------------------
-- TENANT_USERS  (membresía + RBAC)
-- ---------------------------------------------------------------------
create table public.tenant_users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.users_profiles(id) on delete cascade,
  role        tenant_role not null default 'EDITOR',
  invited_by  uuid references public.users_profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_users_user_idx   on public.tenant_users (user_id);
create index tenant_users_tenant_idx on public.tenant_users (tenant_id);

-- ---------------------------------------------------------------------
-- CATEGORIES  (jerárquicas: Blog / Casos de Estudio / Servicios)
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete set null,
  kind        category_kind not null default 'BLOG',
  slug        citext not null,
  name        text not null,
  description text,
  seo         jsonb not null default '{}'::jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index categories_tenant_kind_idx on public.categories (tenant_id, kind, position);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- TAGS / ETIQUETAS
-- ---------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  slug       citext not null,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index tags_tenant_idx on public.tags (tenant_id);

-- ---------------------------------------------------------------------
-- MEDIA
-- ---------------------------------------------------------------------
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  provider     storage_provider not null default 'SUPABASE',
  bucket       text not null,
  path         text not null,          -- siempre "<tenant_id>/<yyyy>/<mm>/<uuid>.<ext>"
  mime_type    text not null,
  size_bytes   bigint not null,
  width        integer,
  height       integer,
  alt_text     text,
  checksum     text,
  uploaded_by  uuid references public.users_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);
create index media_tenant_idx on public.media (tenant_id, created_at desc);

-- Blindaje: la ruta física SIEMPRE debe empezar por el tenant_id.
alter table public.media
  add constraint media_path_tenant_prefix
  check (path like tenant_id::text || '/%');

-- ---------------------------------------------------------------------
-- POSTS
-- ---------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete set null,
  author_id     uuid references public.users_profiles(id) on delete set null,
  cover_media_id uuid references public.media(id) on delete set null,

  slug          citext not null,
  title         text not null,
  excerpt       text,

  -- Salida dual del editor Tiptap
  content_json  jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_html  text  not null default '',

  -- Modelado dinámico sin tocar el esquema SQL
  custom_fields jsonb not null default '{}'::jsonb,

  status        content_status not null default 'DRAFT',
  published_at  timestamptz,
  scheduled_for timestamptz,
  seo           jsonb not null default '{}'::jsonb,
  reading_time  integer,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  unique (tenant_id, slug),
  constraint posts_published_needs_date check (
    status <> 'PUBLISHED' or published_at is not null
  )
);

create index posts_tenant_status_idx on public.posts (tenant_id, status, published_at desc nulls last);
create index posts_tenant_category_idx on public.posts (tenant_id, category_id);
create index posts_custom_fields_gin on public.posts using gin (custom_fields jsonb_path_ops);

-- Búsqueda full-text por tenant
alter table public.posts add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')
  ) stored;
create index posts_search_idx on public.posts using gin (search_vector);

create trigger posts_updated_at before update on public.posts
  for each row execute function public.tg_set_updated_at();

create table public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
create index post_tags_tag_idx on public.post_tags (tag_id);

-- Integridad cruzada: un post no puede referenciar entidades de otro tenant.
create or replace function public.tg_assert_same_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  if new.category_id is not null then
    select tenant_id into v_tenant from public.categories where id = new.category_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'category_id pertenece a otro tenant';
    end if;
  end if;
  if new.cover_media_id is not null then
    select tenant_id into v_tenant from public.media where id = new.cover_media_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'cover_media_id pertenece a otro tenant';
    end if;
  end if;
  return new;
end;
$$;
create trigger posts_assert_tenant before insert or update on public.posts
  for each row execute function public.tg_assert_same_tenant();

-- ---------------------------------------------------------------------
-- API KEYS  (nunca se almacena la clave en claro)
-- ---------------------------------------------------------------------
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  key_prefix   text not null unique,        -- "kntr_live_ab12cd34"  → lookup rápido
  key_hash     text not null,               -- sha256(secret) en hex
  scopes       text[] not null default array['content:read'],
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references public.users_profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index api_keys_tenant_idx on public.api_keys (tenant_id) where revoked_at is null;

-- ---------------------------------------------------------------------
-- WEBHOOKS  + entregas
-- ---------------------------------------------------------------------
create table public.webhooks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  url         text not null,
  secret      text not null default encode(extensions.gen_random_bytes(24), 'hex'), -- HMAC-SHA256
  events      webhook_event[] not null default array['post.published']::webhook_event[],
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint webhooks_url_https check (url ~* '^https://')
);
create index webhooks_tenant_idx on public.webhooks (tenant_id) where is_active;
create trigger webhooks_updated_at before update on public.webhooks
  for each row execute function public.tg_set_updated_at();

create table public.webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid not null references public.webhooks(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  event       webhook_event not null,
  payload     jsonb not null,
  attempt     integer not null default 1,
  status_code integer,
  error       text,
  delivered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index webhook_deliveries_tenant_idx on public.webhook_deliveries (tenant_id, created_at desc);

-- ---------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  actor_id    uuid references public.users_profiles(id) on delete set null,
  action      text not null,        -- 'post.publish', 'api_key.revoke', ...
  entity      text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);
