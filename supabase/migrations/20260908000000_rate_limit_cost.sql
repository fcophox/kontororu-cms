-- =====================================================================
-- Coste variable en el limitador de cupo — PASO 1 de 2 (añadir).
--
-- El limitador contaba PETICIONES, lo cual es correcto mientras cada
-- petición hace una cosa. GraphQL rompe esa premisa: una sola llamada puede
-- pedir 100 entradas con sus portadas, sus categorías y sus traducciones —
-- el trabajo de decenas de peticiones REST— y descontar 1 del cupo.
--
-- Sin esto, exponer GraphQL habría sido abrir un agujero en el limitador que
-- ya existía: bastaba con mover el tráfico a `/graphql` para multiplicar por
-- cien lo que un plan permite.
--
-- ⚠️ Renumerada de 20260803001100 a 20260908000000. Aquella versión colisionaba
-- con `20260803001100_content_index.sql`, creada en paralelo en `main` y ya
-- aplicada en producción. `db push` compara la VERSIÓN, no el nombre del
-- fichero: con el número viejo esta migración se habría saltado en silencio,
-- dejando `consume_rate_limit` con 3 argumentos mientras el código la llama
-- con 4 — y el agujero del limitador abierto. No devolver el número atrás.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTA MIGRACIÓN NO BORRA LA VERSIÓN DE 3 ARGUMENTOS
--
-- Las migraciones se aplican ANTES de que termine de desplegarse el código.
-- Si esta borrara la firma vieja, durante esa ventana el código aún en
-- producción llamaría a una función que ya no existe, y el limitador —que
-- guarda TODAS las rutas /api/v1— empezaría a fallar.
--
-- Así que aquí sólo se añade. La firma vieja se queda como envoltorio que
-- delega con coste 1, que es exactamente lo que hacía antes. El borrado va
-- en una migración posterior, que se aplica cuando el código nuevo ya está
-- desplegado y nadie llama con 3 argumentos.
--
-- El envoltorio DELEGA en vez de duplicar el cuerpo: dos implementaciones de
-- un limitador divergen en la primera corrección que sólo se aplica a una.
--
-- ⚠️ La versión de 4 argumentos NO declara `default` en `p_cost`, y no es un
-- descuido. Con un valor por defecto, una llamada de 3 argumentos encajaría
-- en las dos firmas y PostgREST no podría elegir candidata: rompería justo
-- lo que esta migración viene a evitar.
-- =====================================================================

-- Sólo la firma de 4 argumentos, que en producción todavía NO existe: esto no
-- toca la de 3, que es la que está sirviendo. Hace falta porque
-- `create or replace` NO puede quitar un valor por defecto de un parámetro
-- («cannot remove parameter defaults from existing function»), y sin este drop
-- la migración fallaría al reaplicarse sobre una base donde ya se hubiera
-- creado con `p_cost integer default 1`.
drop function if exists public.consume_rate_limit(text, integer, integer, integer);

create function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer,
  -- Cuántas unidades gasta esta petición. REST gasta 1; GraphQL, lo que
  -- cueste su consulta.
  p_cost integer
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

-- La firma vieja pasa a ser un envoltorio: mismo comportamiento que antes
-- —una petición, una unidad— pero con una sola implementación detrás.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language sql security definer set search_path = public as $$
  select * from public.consume_rate_limit(p_bucket, p_limit, p_window_seconds, 1);
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;

revoke execute on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
