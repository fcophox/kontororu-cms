-- =====================================================================
-- Cerrar `anon` en las tablas de los complementos
--
-- Supabase concede por defecto todos los privilegios sobre cada tabla nueva
-- a anon, authenticated y service_role. El `revoke all ... from anon` de la
-- migración de RLS se ejecutó una sola vez, sobre las tablas que existían
-- entonces: `tenant_addons` y `form_submissions` nacieron después y llegaron
-- a producción con `anon` pudiendo leer y escribir.
--
-- No llegó a haber exposición —RLS está activa y forzada, y sin `auth.uid()`
-- ninguna política concede una sola fila—, pero la postura del proyecto es
-- que `anon` no alcanza datos de negocio: la API pública entra por route
-- handlers con service_role tras validar la API Key. Una tabla con datos
-- personales de terceros no es el sitio para dejar que la única defensa sea
-- la política.
--
-- Esto se repetirá con CADA tabla nueva. Mientras no se cambien los default
-- privileges del proyecto, toda migración que cree una tabla tiene que
-- revocar anon y conceder a service_role explícitamente.
-- =====================================================================

revoke all on public.tenant_addons    from anon;
revoke all on public.form_submissions from anon;
