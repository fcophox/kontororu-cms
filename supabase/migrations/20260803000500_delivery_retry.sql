-- =====================================================================
-- Reintento manual de entregas de webhook.
--
-- `webhook_deliveries` sólo tenía política de SELECT y GRANT de lectura: la
-- cola la escribe el trigger y la actualiza el worker con service_role. Pero
-- el panel necesita poder reencolar una entrega fallida, y sin esto el UPDATE
-- afectaba a cero filas SIN error — el botón parecía funcionar y no hacía nada.
-- =====================================================================

grant update on public.webhook_deliveries to authenticated;

drop policy if exists webhook_deliveries_retry on public.webhook_deliveries;
create policy webhook_deliveries_retry on public.webhook_deliveries
  for update to authenticated
  using ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) )
  with check ( (select public.is_superadmin()) or public.is_tenant_manager(tenant_id) );

/**
 * El reintento sólo puede tocar la programación, nunca el resultado.
 *
 * Sin esto, un Client Admin podría marcar `delivered_at` a mano y hacer que
 * una entrega que nunca llegó figure como entregada — justo el dato que se
 * mira cuando un cliente reporta que su web no se actualiza.
 */
create or replace function public.tg_protect_delivery_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_superadmin() or public.is_platform_context() then
    return new;
  end if;

  new.webhook_id  := old.webhook_id;
  new.tenant_id   := old.tenant_id;
  new.event       := old.event;
  new.payload     := old.payload;
  new.status_code := old.status_code;
  new.delivered_at := old.delivered_at;
  new.created_at  := old.created_at;
  return new;
end;
$$;

drop trigger if exists webhook_deliveries_protect_columns on public.webhook_deliveries;
create trigger webhook_deliveries_protect_columns
  before update on public.webhook_deliveries
  for each row execute function public.tg_protect_delivery_columns();
