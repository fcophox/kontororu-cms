-- =====================================================================
-- Rate limiting de la API pública.
--
-- Por qué en Postgres y no en memoria: la app corre en serverless, donde cada
-- instancia tendría su propio contador. Con diez instancias, un límite de 60
-- se convierte en 600. El contador tiene que ser compartido.
--
-- Por qué no Upstash/Redis: ya hay una base de datos, y meter otro proveedor
-- añade credenciales, coste y un punto de fallo más. Si el volumen lo pide,
-- esta función se sustituye por Redis sin tocar los endpoints.
-- =====================================================================

/*
 * UNLOGGED a propósito: sin WAL, las escrituras son mucho más baratas, y son
 * el precio de cada petición a la API. Se pierde en un crash de Postgres, lo
 * que sólo significa que los contadores arrancan de cero — aceptable para un
 * limitador, inaceptable para cualquier otra cosa.
 */
create unlogged table public.api_rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null,
  request_count integer not null default 0
);

alter table public.api_rate_limits enable row level security;
alter table public.api_rate_limits force row level security;
-- Sin políticas: sólo se toca desde `service_role` vía la función de abajo.
revoke all on public.api_rate_limits from anon, authenticated;

/**
 * Consume una unidad del cupo y dice si la petición pasa.
 *
 * Ventana fija ALINEADA al reloj (no deslizante desde la primera petición):
 * así `reset_at` es un instante predecible que se puede devolver en la
 * cabecera, y el cliente sabe exactamente cuándo reintentar.
 *
 * Todo ocurre en un único UPSERT: dos peticiones simultáneas de la misma
 * clave no pueden leer el mismo contador y escribir ambas "1".
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits (bucket, window_start, request_count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket) do update
    set
      -- Si la fila es de una ventana anterior, el contador se reinicia.
      request_count = case
        when public.api_rate_limits.window_start < v_window_start then 1
        else public.api_rate_limits.request_count + 1
      end,
      window_start = v_window_start
  returning public.api_rate_limits.request_count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

/**
 * Limpieza de ventanas viejas.
 *
 * Sin esto la tabla crece con una fila por cada clave e IP vistas nunca más
 * borradas. Se llama desde el worker de webhooks, que ya corre cada minuto:
 * un cron más para esto no compensa.
 */
create or replace function public.prune_rate_limits()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  delete from public.api_rate_limits where window_start < now() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- ---------------------------------------------------------------------
-- El plan del tenant decide el cupo, así que la resolución de la clave
-- tiene que devolverlo: si no, cada petición necesitaría una consulta extra
-- a `tenants` sólo para saber cuánto puede pedir.
-- ---------------------------------------------------------------------
drop function if exists public.resolve_api_key(text, text);

create or replace function public.resolve_api_key(p_prefix text, p_secret text)
returns table (tenant_id uuid, api_key_id uuid, scopes text[], plan tenant_plan)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row public.api_keys%rowtype;
  v_plan tenant_plan;
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

  select t.plan into v_plan
  from public.tenants t
  where t.id = v_row.tenant_id
    and t.status in ('TRIAL', 'ACTIVE')
    and t.deleted_at is null;

  if v_plan is null then
    return;
  end if;

  update public.api_keys set last_used_at = now() where id = v_row.id;

  return query select v_row.tenant_id, v_row.id, v_row.scopes, v_plan;
end;
$$;

revoke execute on function public.resolve_api_key(text, text) from public, anon, authenticated;
grant execute on function public.resolve_api_key(text, text) to service_role;
