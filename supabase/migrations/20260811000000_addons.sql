-- =====================================================================
-- Complementos (add-ons de Rukma Studio)
--
-- MODELO: el catálogo NO vive en la base, vive en el código
-- (`src/lib/addons/catalog.ts`). Esta tabla sólo guarda la decisión del
-- cliente: qué complementos tiene activos y cómo los ha configurado.
--
-- Es deliberado. Un complemento no son datos: son una página, un formulario
-- y un endpoint que se despliegan con la aplicación. Tener una fila de
-- catálogo en la base permitiría "activar" algo que este despliegue no sabe
-- renderizar, y el cliente vería un enlace roto. Con el catálogo en código,
-- lo que se puede activar es exactamente lo que existe.
--
-- `settings` es JSONB por la misma razón que el catálogo es código: cada
-- complemento tiene una forma distinta y la valida su propio esquema Zod al
-- guardar. Una tabla por complemento sería una migración por complemento.
-- =====================================================================

create table public.tenant_addons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  -- Clave del catálogo en código: 'calendar', 'booking', ...
  addon_key   text not null,
  is_enabled  boolean not null default false,
  -- Configuración propia del complemento. La valida la aplicación, no la base:
  -- aquí sólo se garantiza que es un objeto y no una lista o un escalar.
  settings    jsonb not null default '{}'::jsonb,
  enabled_at  timestamptz,
  enabled_by  uuid references public.users_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tenant_addons_key_format check (addon_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  constraint tenant_addons_settings_object check (jsonb_typeof(settings) = 'object'),
  -- Un complemento, una fila por espacio. El upsert de la acción de servidor
  -- depende de esta restricción para no duplicar configuraciones.
  constraint tenant_addons_unique unique (tenant_id, addon_key)
);

comment on table public.tenant_addons is
  'Complementos activados por cada espacio. El catálogo está en el código, no aquí.';
comment on column public.tenant_addons.addon_key is
  'Clave del catálogo (src/lib/addons/catalog.ts). Una clave desconocida es un complemento retirado, no un error.';

-- Se filtra por activos porque es la consulta de cada carga del panel.
create index tenant_addons_tenant_idx on public.tenant_addons (tenant_id) where is_enabled;

drop trigger if exists tenant_addons_updated_at on public.tenant_addons;
create trigger tenant_addons_updated_at before update on public.tenant_addons
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tenant_addons enable row level security;
alter table public.tenant_addons force row level security;

grant select, insert, update, delete on public.tenant_addons to authenticated;

-- El `grant all … to service_role` de la migración de RLS sólo alcanzó a las
-- tablas que existían entonces. Sin esto, la API pública —que consulta con
-- service_role tras validar la API Key— recibe un 42501 en vez de datos.
grant all on public.tenant_addons to service_role;

-- Leer: cualquier miembro. Un editor necesita saber si el calendario está
-- activo aunque no pueda activarlo.
create policy tenant_addons_select on public.tenant_addons for select to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_member(tenant_id) );

-- Escribir: OWNER/ADMIN. Activar un complemento será facturable, y eso no lo
-- decide quien redacta las entradas.
create policy tenant_addons_write on public.tenant_addons for all to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );
