-- ---------------------------------------------------------------------
-- CATEGORÍAS TRANSVERSALES
-- ---------------------------------------------------------------------
/*
 * Una categoría deja de tener idioma: "Blog" es la misma categoría tanto si
 * clasifica un artículo en español como en inglés.
 *
 * El modelo anterior (20260803001000_i18n.sql) daba a cada categoría un
 * `locale` y un `translation_group_id`, y un trigger exigía que post y
 * categoría compartieran idioma. En la práctica obligaba a mantener un juego
 * de categorías por idioma, y el panel nunca llegó a exponer ni el idioma ni
 * el grupo de traducción: toda categoría creada desde la interfaz nacía en el
 * idioma por defecto y en un grupo propio. El resultado era que el contenido
 * traducido se quedaba literalmente sin categoría.
 *
 * Se conserva el idioma en POSTS: ahí sí distingue versiones de un contenido.
 * Lo que se elimina es el idioma de la taxonomía.
 */

-- ---------------------------------------------------------------------
-- 1. Fuera la coherencia por idioma
-- ---------------------------------------------------------------------
/*
 * El trigger cae ANTES de reasignar posts: mientras exista, repuntar un post
 * en español a la categoría que sobrevive en inglés fallaría, y el paso 2 no
 * podría ejecutarse.
 */
drop trigger if exists posts_assert_category_locale on public.posts;
drop function if exists public.tg_assert_category_locale();
drop trigger if exists categories_assert_locale on public.categories;

-- ---------------------------------------------------------------------
-- 2. Fusionar las traducciones de una misma categoría
-- ---------------------------------------------------------------------
/*
 * Las filas que comparten `translation_group_id` YA eran la misma categoría en
 * distintos idiomas: colapsan en una. Sobrevive la del idioma principal del
 * tenant y, a igualdad, la más antigua —la que con más probabilidad tiene los
 * enlaces publicados.
 *
 * Las categorías que no comparten grupo se quedan como están: son distintas de
 * verdad, y fusionarlas por parecerse el nombre sería adivinar.
 */
with survivor as (
  select distinct on (c.translation_group_id)
    c.translation_group_id,
    c.id
  from public.categories c
  join public.tenants t on t.id = c.tenant_id
  order by
    c.translation_group_id,
    (c.locale = t.default_locale) desc,
    c.created_at asc
),
merged as (
  select c.id as old_id, s.id as new_id
  from public.categories c
  join survivor s on s.translation_group_id = c.translation_group_id
  where c.id <> s.id
)
update public.posts p
   set category_id = m.new_id
  from merged m
 where p.category_id = m.old_id;

-- Las subcategorías siguen a su padre fusionado en vez de quedar huérfanas.
with survivor as (
  select distinct on (c.translation_group_id)
    c.translation_group_id,
    c.id
  from public.categories c
  join public.tenants t on t.id = c.tenant_id
  order by
    c.translation_group_id,
    (c.locale = t.default_locale) desc,
    c.created_at asc
),
merged as (
  select c.id as old_id, s.id as new_id
  from public.categories c
  join survivor s on s.translation_group_id = c.translation_group_id
  where c.id <> s.id
)
update public.categories c
   set parent_id = m.new_id
  from merged m
 where c.parent_id = m.old_id;

delete from public.categories c
 using (
   select distinct on (c2.translation_group_id)
     c2.translation_group_id,
     c2.id
     from public.categories c2
     join public.tenants t on t.id = c2.tenant_id
    order by
      c2.translation_group_id,
      (c2.locale = t.default_locale) desc,
      c2.created_at asc
 ) s
 where c.translation_group_id = s.translation_group_id
   and c.id <> s.id;

-- ---------------------------------------------------------------------
-- 3. El slug vuelve a ser único por tenant
-- ---------------------------------------------------------------------
/*
 * Sin idioma, dos categorías distintas pueden chocar en slug (p. ej. "blog" en
 * español y "blog" en inglés que nunca se enlazaron como traducciones). Se
 * numeran antes de crear la restricción; renombrar a mano después de un fallo
 * de migración es peor que un slug con sufijo.
 */
with dup as (
  select
    id,
    slug,
    row_number() over (partition by tenant_id, slug order by created_at asc) as n
  from public.categories
)
update public.categories c
   set slug = c.slug || '-' || dup.n
  from dup
 where c.id = dup.id
   and dup.n > 1;

-- ---------------------------------------------------------------------
-- 4. Fuera el idioma de la taxonomía
-- ---------------------------------------------------------------------
drop index if exists public.categories_group_locale_key;
drop index if exists public.categories_tenant_locale_idx;

alter table public.categories
  drop constraint if exists categories_tenant_locale_slug_key;

alter table public.categories
  drop column if exists locale,
  drop column if exists translation_group_id;

alter table public.categories
  add constraint categories_tenant_id_slug_key unique (tenant_id, slug);
