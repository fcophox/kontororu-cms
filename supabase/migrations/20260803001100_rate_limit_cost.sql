-- =====================================================================
-- Coste variable en el limitador de cupo.
--
-- El limitador contaba PETICIONES, lo cual es correcto mientras cada
-- petición hace una cosa. GraphQL rompe esa premisa: una sola llamada puede
-- pedir 100 entradas con sus portadas, sus categorías y sus traducciones —
-- el trabajo de decenas de peticiones REST— y descontar 1 del cupo.
--
-- Sin esto, exponer GraphQL habría sido abrir un agujero en el limitador que
-- ya existía: bastaba con mover el tráfico a `/graphql` para multiplicar por
-- cien lo que un plan permite.
-- =====================================================================

drop function if exists public.consume_rate_limit(text, integer, integer);

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer,
  -- Cuántas unidades gasta esta petición. REST gasta 1; GraphQL, lo que
  -- cueste su consulta.
  p_cost integer default 1
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_cost integer := greatest(1, coalesce(p_cost, 1));
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits (bucket, window_start, request_count)
  values (p_bucket, v_window_start, v_cost)
  on conflict (bucket) do update
    set
      request_count = case
        when public.api_rate_limits.window_start < v_window_start then v_cost
        else public.api_rate_limits.request_count + v_cost
      end,
      window_start = v_window_start
  returning public.api_rate_limits.request_count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;
