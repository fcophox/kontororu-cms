-- =====================================================================
-- Backoff real para la cola de webhooks.
--
-- La versión anterior seleccionaba por `created_at` sin más: el worker
-- reintentaba cada minuto y agotaba los 6 intentos en 6 minutos. Un deploy
-- del cliente que tarde diez en volver perdía la entrega para siempre.
--
-- `next_attempt_at` mueve la decisión de "cuándo reintentar" a la base, que
-- es donde vive la cola. El worker sólo pregunta qué toca ahora.
-- =====================================================================

alter table public.webhook_deliveries
  add column next_attempt_at timestamptz not null default now();

comment on column public.webhook_deliveries.next_attempt_at is
  'Momento a partir del cual el worker puede reintentar. Backoff exponencial: 1, 2, 4, 8, 16, 32 minutos.';

-- El índice parcial cubre exactamente la consulta del worker: pendientes,
-- con intentos restantes y ya vencidas.
drop index if exists webhook_deliveries_pending_idx;

create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (next_attempt_at)
  where delivered_at is null and attempt < 6;
