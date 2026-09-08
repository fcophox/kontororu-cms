-- =====================================================================
-- Pausar el acceso de un colaborador sin borrarlo
--
-- Hasta ahora la única forma de cortarle el acceso a alguien era eliminar
-- su membresía, y eso pierde el rastro: quién lo invitó, cuándo entró, con
-- qué rol. Una baja temporal —alguien de vacaciones, un freelance entre
-- proyectos, una cuenta bajo sospecha— acababa siendo un borrado y una
-- reinvitación.
--
-- La pausa NO es cosmética: se aplica en los helpers de RLS, así que un
-- colaborador pausado deja de ver los datos del tenant en la misma consulta,
-- no sólo en la interfaz. Si viviera únicamente en la UI, su API y sus
-- llamadas directas a PostgREST seguirían funcionando.
-- =====================================================================

alter table public.tenant_users
  add column if not exists suspended_at timestamptz;

comment on column public.tenant_users.suspended_at is
  'Acceso pausado por un gestor del espacio o por Rukma Studio. Null = activo.';

-- El índice de membresía se usa en cada request (user_tenant_ids); filtrar
-- por suspended_at sin él obligaría a leer también las filas pausadas.
create index if not exists tenant_users_active_idx
  on public.tenant_users (user_id)
  where suspended_at is null;

-- ---------------------------------------------------------------------
-- Los helpers de RLS dejan de contar las membresías pausadas.
--
-- `user_tenant_ids()` es la base de casi toda política del sistema: al
-- vaciarse para el usuario pausado, pierde de golpe posts, media, categorías
-- y su propia fila de tenant_users. `has_tenant_role()` se ajusta también,
-- porque si no un OWNER pausado seguiría pudiendo escribir.
-- ---------------------------------------------------------------------
create or replace function public.user_tenant_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(tu.tenant_id), '{}')
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and tu.suspended_at is null;
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles tenant_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = p_tenant
      and tu.suspended_at is null
      and tu.role = any (p_roles)
  );
$$;
