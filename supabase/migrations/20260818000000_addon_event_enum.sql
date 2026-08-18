-- =====================================================================
-- Nuevo valor del enum de eventos: `addon.updated`.
--
-- Va SOLO en esta migración, sin usarlo en ningún sitio. Postgres no deja
-- emplear un valor de enum en la misma transacción en la que se añade, y
-- cada archivo de migración se aplica dentro de una transacción: el trigger
-- que lo emite vive en el archivo siguiente para que ya esté confirmado.
--
-- Se añade al final del enum a propósito. `webhook_event` no se ordena por
-- nada —sólo se compara por igualdad— pero insertar en medio con BEFORE
-- reescribe el orden y no aporta nada.
-- =====================================================================

alter type webhook_event add value if not exists 'addon.updated';
