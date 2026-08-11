-- =====================================================================
-- Inventario de contenido: una fila por contenido, no por idioma.
--
-- El modelo de traducciones guarda cada idioma como una fila completa de
-- `posts` (ver 20260803001000_i18n.sql), y es la decisión correcta: cada
-- idioma necesita su URL, su SEO y su propio estado editorial.
--
-- El precio lo paga el listado del CMS, que enseña las filas en crudo: al
-- traducir un artículo aparece dos veces. Con cuatro idiomas activos, un blog
-- de 50 entradas se ve como 200 y el inventario deja de ser legible.
--
-- Esta vista colapsa cada grupo a su ORIGINAL y adjunta qué idiomas existen y
-- en qué estado está cada uno. No sustituye a `posts` —la papelera y el editor
-- siguen trabajando fila a fila—, sólo alimenta el listado.
-- =====================================================================

create view public.content_index
with (security_invoker = true) as
-- El `distinct on` obliga a ordenar por `translation_group_id`. Envolviéndolo
-- en una subconsulta, quien consulta la vista puede ordenar por `updated_at`
-- y paginar con un `count` exacto.
select * from (
  select distinct on (p.translation_group_id)
    p.id,
    p.tenant_id,
    p.translation_group_id,
    p.slug,
    p.title,
    p.excerpt,
    p.status,
    p.locale,
    p.category_id,
    p.author_id,
    p.published_at,
    p.updated_at,
    p.created_at,
    p.deleted_at,

    -- Para filtrar por idioma: `?locales=cs.{en}` devuelve los contenidos que
    -- tienen versión inglesa, no los posts escritos en inglés.
    (select array_agg(s.locale order by s.locale)
       from public.posts s
      where s.translation_group_id = p.translation_group_id
        and s.deleted_at is null) as locales,

    -- Para los badges del listado. Va agregado aquí y no en una consulta
    -- aparte porque, fila a fila, serían N+1 viajes por página.
    (select jsonb_agg(jsonb_build_object(
              'id', s.id, 'locale', s.locale, 'status', s.status)
              order by s.locale)
       from public.posts s
      where s.translation_group_id = p.translation_group_id
        and s.deleted_at is null) as versions

  from public.posts p
  join public.tenants t on t.id = p.tenant_id
  where p.deleted_at is null
  order by
    p.translation_group_id,
    -- El original es la fila en el idioma principal del espacio.
    (p.locale = t.default_locale) desc,
    -- Si esa fila no existe —alguien borró el español y dejó el inglés—,
    -- manda la más antigua. Una fila rara es mejor que un contenido que
    -- desaparece del inventario y ya no hay forma de alcanzar.
    p.created_at
) originals;

grant select on public.content_index to authenticated;
revoke all on public.content_index from anon;

comment on view public.content_index is
  'Un contenido por fila, con sus idiomas. security_invoker: aplica las políticas de quien consulta.';
