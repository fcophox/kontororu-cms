-- =====================================================================
-- Eventos de webhook para la configuración de los complementos.
--
-- El hueco: la API pública sirve la configuración de los complementos
-- —hoy la disponibilidad del Calendario— pero los eventos se emitían sólo
-- desde `posts`. Un cliente que corregía su horario no generaba ningún
-- aviso, así que la web seguía ofreciendo las horas viejas hasta que
-- caducara su caché, y con ISR esperando un `revalidateTag` que nunca
-- llegaba, hasta el siguiente despliegue. Desde el panel se veía
-- "Disponibilidad guardada" y en la web no cambiaba nada.
--
-- El evento va en la BASE y no en la Server Action a propósito: la fila se
-- toca desde la pantalla del complemento, desde el interruptor de
-- Complementos y desde soporte. Un trigger los cubre los tres; emitirlo
-- desde la acción cubre uno y deja los otros dos en silencio.
-- =====================================================================

create or replace function public.tg_enqueue_addon_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row     public.tenant_addons%rowtype;
  v_enabled boolean;
  v_hook    record;
  v_payload jsonb;
begin
  v_row := coalesce(new, old);

  -- Sólo es noticia lo que cambia lo que la API devuelve: encender, apagar
  -- o reconfigurar. Un UPDATE que deja igual ambas cosas —`enabled_by` al
  -- reactivar, un `updated_at`— haría revalidar a la web sin motivo.
  if tg_op = 'UPDATE'
     and old.is_enabled is not distinct from new.is_enabled
     and old.settings   is not distinct from new.settings then
    return v_row;
  end if;

  -- Borrar la fila y apagar el complemento son lo mismo de cara a fuera:
  -- deja de haber datos que servir. La web sólo necesita saber eso.
  v_enabled := case when tg_op = 'DELETE' then false else v_row.is_enabled end;

  -- El payload NO lleva la configuración, igual que el de contenido no lleva
  -- el cuerpo del artículo: es un aviso de "esto cambió, vuelve a pedirlo",
  -- y así la web lee siempre por la API en vez de tener dos formas distintas
  -- de enterarse de lo mismo, que acaban divergiendo.
  v_payload := jsonb_build_object(
    'event',      'addon.updated',
    'tenantId',   v_row.tenant_id,
    'occurredAt', now(),
    'data', jsonb_build_object(
      'addon',     v_row.addon_key,
      'isEnabled', v_enabled
    )
  );

  for v_hook in
    select id from public.webhooks
    where tenant_id = v_row.tenant_id
      and is_active
      and 'addon.updated' = any (events)
  loop
    insert into public.webhook_deliveries (webhook_id, tenant_id, event, payload)
    values (v_hook.id, v_row.tenant_id, 'addon.updated', v_payload);
  end loop;

  return v_row;
end;
$$;

-- `create or replace` no existe para triggers, así que un archivo que se
-- quede a medias —o que se reintente tras un push interrumpido— choca contra
-- el trigger que él mismo creó y no hay forma de avanzar sin tocar la base a
-- mano. Con el drop previo, reaplicarlo es seguro y converge al mismo estado.
drop trigger if exists tenant_addons_enqueue_events on public.tenant_addons;

create trigger tenant_addons_enqueue_events
  after insert or update or delete on public.tenant_addons
  for each row execute function public.tg_enqueue_addon_event();
