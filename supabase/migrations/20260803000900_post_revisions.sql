-- =====================================================================
-- Historial de versiones de contenido.
--
-- Hasta ahora, guardar sobrescribía sin dejar rastro: un editor que pega
-- encima del artículo equivocado destruye el trabajo de otro y no hay forma
-- de recuperarlo. Es la pérdida de datos más probable del producto, porque
-- no requiere ningún fallo técnico — sólo un despiste.
-- =====================================================================

create table public.post_revisions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,

  -- Número legible por post: "versión 7" dice más que un uuid.
  version       integer not null,

  -- Instantánea de lo que el usuario percibe como "el contenido".
  title         text not null,
  slug          citext not null,
  excerpt       text,
  content_json  jsonb not null,
  content_html  text not null,
  custom_fields jsonb not null default '{}'::jsonb,
  seo           jsonb not null default '{}'::jsonb,
  category_id   uuid,
  status        content_status not null,

  created_by    uuid references public.users_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (post_id, version)
);

create index if not exists post_revisions_post_idx on public.post_revisions (post_id, version desc);
create index if not exists post_revisions_tenant_idx on public.post_revisions (tenant_id);

comment on table public.post_revisions is
  'Instantánea del contenido en cada guardado. La escribe un trigger, nunca la aplicación.';

-- ---------------------------------------------------------------------
-- Captura automática
-- ---------------------------------------------------------------------
/**
 * Guarda una versión en cada cambio con sustancia.
 *
 * Va en un trigger y no en la Server Action a propósito: el historial no
 * puede depender de que cada camino de escritura se acuerde de registrarlo.
 * Un `UPDATE` desde psql, desde un script de migración de datos o desde una
 * acción futura queda igualmente versionado.
 *
 * SECURITY DEFINER porque `post_revisions` tiene RLS con FORCE y ninguna
 * política de INSERT: nadie escribe el historial desde el cliente.
 */
create or replace function public.tg_capture_post_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
begin
  -- Sólo cambios que el usuario reconocería como una edición. Sin esto, cada
  -- publicación o paso por la papelera generaría una versión idéntica a la
  -- anterior y el historial sería ilegible.
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

  -- El UPDATE mantiene bloqueada la fila de `posts`, así que dos guardados
  -- del MISMO post no pueden calcular el mismo número a la vez.
  select coalesce(max(version), 0) + 1 into v_next
  from public.post_revisions where post_id = new.id;

  insert into public.post_revisions (
    post_id, tenant_id, version, title, slug, excerpt,
    content_json, content_html, custom_fields, seo, category_id, status, created_by
  ) values (
    new.id, new.tenant_id, v_next, new.title, new.slug, new.excerpt,
    new.content_json, new.content_html, new.custom_fields, new.seo,
    new.category_id, new.status, auth.uid()
  );

  -- Retención: las 30 últimas por post. Sin poda, un artículo editado a
  -- diario durante un año acumula cientos de copias de su propio cuerpo.
  delete from public.post_revisions
  where post_id = new.id
    and version <= v_next - 30;

  return new;
end;
$$;

drop trigger if exists posts_capture_revision on public.posts;
create trigger posts_capture_revision
  after insert or update on public.posts
  for each row execute function public.tg_capture_post_revision();

-- ---------------------------------------------------------------------
-- RLS: lectura para el tenant, escritura para nadie
-- ---------------------------------------------------------------------
alter table public.post_revisions enable row level security;
alter table public.post_revisions force row level security;

grant select on public.post_revisions to authenticated;

drop policy if exists post_revisions_select on public.post_revisions;
create policy post_revisions_select on public.post_revisions for select to authenticated
  using (
    (select public.is_superadmin())
    or tenant_id in (select unnest(public.user_tenant_ids()))
  );

-- Sin políticas de INSERT/UPDATE/DELETE: el historial sólo lo escribe el
-- trigger. Un editor que pudiera borrar versiones podría tapar sus pasos.
