-- =====================================================================
-- Suscribe al evento `addon.updated` los webhooks que ya existían.
--
-- El evento nace en las dos migraciones anteriores, pero un evento nuevo no
-- llega a nadie: `webhooks.events` es una lista explícita y los endpoints ya
-- configurados quedaron sin él. El caso que lo motiva es justo ese — un
-- cliente cuya web mostraba un horario viejo tenía su webhook creado desde
-- antes, así que arreglar el CMS no le habría cambiado nada hasta que
-- alguien entrase a marcar la casilla espacio por espacio.
--
-- Es una decisión con contrapartida y se toma a conciencia: a esos endpoints
-- empezarán a llegarles entregas de un tipo que no esperaban. Es seguro
-- porque el payload comparte la forma de todos los demás —`event`, `tenantId`,
-- `occurredAt`, `data`— y va firmado igual, así que un receptor que valide la
-- firma y mire `event` lo ignora sin enterarse. Un receptor que revalide a
-- ciegas hará una revalidación de más, no una rotura.
--
-- Se incluyen también los webhooks inactivos: si alguien vuelve a encender
-- uno, debe comportarse como los demás y no arrastrar la suscripción vieja.
--
-- En una base recién creada esto no toca nada —`db reset` aplica migraciones
-- ANTES del seed—, que es lo correcto: sólo tiene sentido sobre los endpoints
-- que ya existían cuando el evento no.
-- =====================================================================

update public.webhooks
set events = events || 'addon.updated'::webhook_event
where not ('addon.updated' = any (events));
