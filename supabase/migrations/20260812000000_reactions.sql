-- =====================================================================
-- Complemento Reacciones — el gesto de "esto me ha gustado"
--
-- MODELO: un CONTADOR por (contenido, gesto), no una fila por clic.
--
-- Una fila por clic permitiría saber quién pulsó y deduplicar en la base,
-- pero para eso hay que guardar algo que identifique al visitante —IP,
-- huella del navegador, cookie— y eso es un dato personal de un tercero que
-- nadie ha pedido guardar. El mismo criterio que en `form_submissions`: si
-- lo que se quiere es un número, se guarda el número.
--
-- El "una vez por persona" lo resuelve la web del cliente en su navegador
-- (localStorage). Es una barrera de cortesía, no de seguridad, y está bien
-- que lo sea: esto cuenta aprecio, no votos.
--
-- El contador cuelga de `translation_group_id`, no de `posts.id`: el artículo
-- en español y su traducción al inglés son el MISMO contenido, y quien lo lee
-- en un idioma u otro está aplaudiendo lo mismo. Si colgara del post, el
-- número se partiría en dos el día que se traduce y el listado del panel
-- —que ya colapsa el grupo a una fila— no sabría cuál enseñar.
--
-- `reaction_key` es libre, igual que `form_key`: el gesto lo elige la web del
-- cliente (un like, un aplauso, un smile) y el primer clic lo da de alta. Un
-- catálogo en la base obligaría a una migración por cada icono nuevo.
-- =====================================================================

create table public.content_reactions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,

  -- El contenido, no la fila. No hay FK: `translation_group_id` no es único
  -- en `posts` —lo comparten todas las traducciones— así que no puede
  -- referenciarse. La integridad la garantiza el RPC, que sólo escribe
  -- grupos que existen y están publicados.
  translation_group_id uuid not null,

  reaction_key         text not null,

  -- bigint y no integer: es un contador que sólo sube y que nadie va a
  -- revisar. Un desbordamiento a los 2.147.483.647 sería un 500 en la web
  -- del cliente en el peor momento posible, el de un contenido viral.
  total                bigint not null default 0,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint content_reactions_key_format check (reaction_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint content_reactions_total_positive check (total >= 0),

  -- Un gesto, un contador por contenido. El `on conflict` del RPC depende de
  -- esta restricción para incrementar en vez de duplicar.
  constraint content_reactions_unique unique (tenant_id, translation_group_id, reaction_key)
);

comment on table public.content_reactions is
  'Contadores de reacciones por contenido (grupo de traducción) y tipo de gesto. Sin datos del visitante.';
comment on column public.content_reactions.translation_group_id is
  'El contenido, no la traducción: todas las versiones de idioma comparten contador.';

-- El ranking del complemento y el número del listado: por espacio y de más
-- reacciones a menos.
create index content_reactions_tenant_idx
  on public.content_reactions (tenant_id, total desc);

drop trigger if exists content_reactions_updated_at on public.content_reactions;
create trigger content_reactions_updated_at before update on public.content_reactions
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
--
-- Leer: cualquier miembro del espacio. Es una métrica de su propio contenido.
--
-- Escribir: NADIE con sesión de usuario. El único camino de escritura es
-- `register_reaction`, que valida el contenido y el complemento. Si se
-- concediera UPDATE a `authenticated`, cualquier miembro podría inflar sus
-- propios números desde la consola del navegador, y una métrica que su dueño
-- puede editar no es una métrica.
--
-- El borrado se deja a OWNER/ADMIN: poner un contador a cero tras una prueba
-- es una operación legítima, y sin ella el único remedio sería la base.
-- ---------------------------------------------------------------------
alter table public.content_reactions enable row level security;
alter table public.content_reactions force row level security;

grant select, delete on public.content_reactions to authenticated;
grant all on public.content_reactions to service_role;

create policy content_reactions_select on public.content_reactions for select to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_member(tenant_id) );

create policy content_reactions_delete on public.content_reactions for delete to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

-- ---------------------------------------------------------------------
-- Registrar una reacción
--
-- Todo en una sola llamada: resolver el espacio, comprobar que el contenido
-- existe y está publicado, comprobar que el complemento está activo e
-- incrementar. Hacerlo en la aplicación serían cuatro viajes a la base por
-- clic, y el incremento en dos pasos (`select total` + `update total + 1`)
-- pierde reacciones en cuanto dos personas pulsan a la vez: ambas leen el
-- mismo número y ambas escriben el mismo+1. El `on conflict do update` es
-- atómico y no tiene esa carrera.
--
-- SECURITY DEFINER porque es la ÚNICA vía de escritura y por eso la tabla no
-- concede insert/update a nadie. Todo lo que decide qué se escribe está aquí
-- dentro y no depende de quién llame.
--
-- Devuelve el total nuevo, o NULL si no hay nada que contar —espacio
-- inexistente, contenido sin publicar o complemento apagado—. Quien llama
-- traduce ese NULL a un 404; la función no distingue los tres casos a
-- propósito: desde fuera, "existe pero es un borrador" no es información
-- pública.
-- ---------------------------------------------------------------------
/*
 * Los parámetros son `text` y NO `citext`, aunque las columnas que comparan
 * sean citext.
 *
 * `citext` vive en el esquema `extensions`, y PostgREST —que es quien llama a
 * esta función desde la API— no lo resuelve al buscar la firma: la petición
 * muere con un PGRST202 "no matches were found in the schema cache", un error
 * que no menciona los tipos y manda a buscar el problema a otra parte. Con
 * `text` en la firma y el casting dentro, la comparación sigue siendo
 * insensible a mayúsculas y la función es invocable.
 */
create or replace function public.register_reaction(
  p_tenant_slug text,
  p_slug        text,
  p_reaction    text,
  p_locale      text default null
)
returns bigint
-- `extensions` en el search_path: ahí vive el tipo citext al que se castea.
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_tenant uuid;
  v_group  uuid;
  v_total  bigint;
begin
  if p_reaction !~ '^[a-z][a-z0-9_-]{1,39}$' then
    return null;
  end if;

  select t.id into v_tenant from public.tenants t where t.slug = p_tenant_slug::citext;
  if v_tenant is null then
    return null;
  end if;

  -- El complemento se comprueba en cada clic, no sólo al configurar: si el
  -- cliente lo desactiva, los contadores dejan de moverse en lugar de seguir
  -- subiendo para una pantalla que ya no mira nadie.
  if not exists (
    select 1 from public.tenant_addons a
     where a.tenant_id = v_tenant and a.addon_key = 'reactions' and a.is_enabled
  ) then
    return null;
  end if;

  /*
   * El slug puede repetirse entre idiomas —la unicidad es (tenant, locale,
   * slug)—, así que la búsqueda puede devolver varias filas. Da igual cuál
   * gane: todas comparten `translation_group_id`, que es lo que se cuenta.
   * `p_locale` existe para el caso raro en que dos contenidos DISTINTOS
   * compartan slug en idiomas distintos.
   */
  select p.translation_group_id into v_group
    from public.posts p
   where p.tenant_id = v_tenant
     and p.slug = p_slug::citext
     and p.status = 'PUBLISHED'
     and p.deleted_at is null
     and p.published_at <= now()
     and (p_locale is null or p.locale = p_locale)
   limit 1;

  if v_group is null then
    return null;
  end if;

  insert into public.content_reactions (tenant_id, translation_group_id, reaction_key, total)
  values (v_tenant, v_group, p_reaction, 1)
  on conflict (tenant_id, translation_group_id, reaction_key)
  do update set total = public.content_reactions.total + 1
  returning total into v_total;

  return v_total;
end;
$$;

comment on function public.register_reaction(text, text, text, text) is
  'Suma una reacción a un contenido publicado. Atómico. NULL si no procede contarla.';

-- Sólo el service_role: la llama el endpoint público tras pasar por el
-- limitador de peticiones. Concederla a `anon` la dejaría accesible
-- directamente por PostgREST, saltándose ese límite.
revoke all on function public.register_reaction(text, text, text, text) from public;
grant execute on function public.register_reaction(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Leer los contadores de un contenido
--
-- Misma resolución que al escribir —espacio + slug publicado— para que la web
-- del cliente pida los números con los mismos datos que ya tiene en la mano y
-- no necesite conocer el uuid del grupo de traducción.
--
-- No comprueba el complemento: un contador que existe se puede seguir
-- enseñando aunque el cliente haya dejado de aceptar clics nuevos. Apagar el
-- complemento congela la cuenta, no la esconde.
-- ---------------------------------------------------------------------
create or replace function public.content_reaction_totals(
  p_tenant_slug text,
  p_slug        text,
  p_locale      text default null
)
returns table (reaction_key text, total bigint)
language sql stable security definer set search_path = public, extensions as $$
  with target as (
    select p.tenant_id, p.translation_group_id
      from public.posts p
      join public.tenants t on t.id = p.tenant_id
     where t.slug = p_tenant_slug::citext
       and p.slug = p_slug::citext
       and p.status = 'PUBLISHED'
       and p.deleted_at is null
       and p.published_at <= now()
       and (p_locale is null or p.locale = p_locale)
     limit 1
  )
  select r.reaction_key, r.total
    from public.content_reactions r
    join target on target.tenant_id = r.tenant_id
                and target.translation_group_id = r.translation_group_id
   order by r.total desc, r.reaction_key;
$$;

revoke all on function public.content_reaction_totals(text, text, text) from public;
grant execute on function public.content_reaction_totals(text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- El número del panel
--
-- Suma de todos los gestos por contenido, para el listado y el ranking. Se
-- agrega en la base porque el listado pinta 20 filas por página y traerse
-- todos los contadores para sumarlos en memoria es un viaje que crece con el
-- histórico del cliente, no con lo que se ve en pantalla.
--
-- SECURITY INVOKER: sigue sujeta a RLS, así que nadie puede leer los números
-- de otro espacio pasando su uuid.
-- ---------------------------------------------------------------------
create or replace function public.content_reaction_summary(p_tenant uuid)
returns table (translation_group_id uuid, total bigint, gestures bigint)
language sql stable security invoker set search_path = public as $$
  select r.translation_group_id, sum(r.total), count(*)
    from public.content_reactions r
   where r.tenant_id = p_tenant
   group by r.translation_group_id;
$$;

grant execute on function public.content_reaction_summary(uuid) to authenticated, service_role;
