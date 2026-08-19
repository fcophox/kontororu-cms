-- =====================================================================
-- Seed de desarrollo.
-- Se aplica con `supabase db reset`. NUNCA se ejecuta en producción.
--
-- Crea DOS tenants a propósito: con uno solo, un fallo de aislamiento es
-- invisible durante el desarrollo. Con dos, saltará a la vista en cuanto
-- aparezca contenido ajeno en una lista.
-- =====================================================================

do $$
declare
  v_root    uuid := gen_random_uuid();
  v_alice   uuid := gen_random_uuid();
  v_bob     uuid := gen_random_uuid();
  v_rukma   uuid;
  v_acme    uuid;
  v_cat     uuid;
begin
  -- ---------------- usuarios (password: password123) ----------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          -- GoTrue lee estas columnas como `string`, no como
                          -- `*string`: dejarlas a NULL provoca un 500
                          -- ("converting NULL to string is unsupported") en
                          -- CADA intento de login. Deben ser cadena vacía.
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change_token_current,
                          email_change, phone_change, phone_change_token,
                          reauthentication_token)
  values
    (v_root,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'fcojhormazabalh@gmail.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Rukma Root"}', now(), now(),
     '', '', '', '', '', '', '', ''),
    (v_alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'alice@rukma.studio', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Alice"}', now(), now(),
     '', '', '', '', '', '', '', ''),
    (v_bob,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bob@acme.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Bob"}', now(), now(),
     '', '', '', '', '', '', '', '');

  update public.users_profiles set is_superadmin = true where id = v_root;

  -- ---------------- tenants ----------------
  insert into public.tenants (slug, name, status, plan, branding)
  values ('rukma', 'Rukma Studio', 'ACTIVE', 'ENTERPRISE',
          '{"logoUrl":null,"faviconUrl":null,"primary":"#111827","secondary":"#6366f1","radius":"0.625rem"}')
  returning id into v_rukma;

  -- Colores deliberadamente distintos: al cambiar de tenant el theming
  -- dinámico debe notarse de inmediato.
  insert into public.tenants (slug, name, status, plan, branding)
  values ('acme', 'ACME Corp', 'ACTIVE', 'PRO',
          '{"logoUrl":null,"faviconUrl":null,"primary":"#e11d48","secondary":"#f59e0b","radius":"1rem"}')
  returning id into v_acme;

  insert into public.tenant_users (tenant_id, user_id, role, accepted_at) values
    (v_rukma, v_alice, 'OWNER', now()),
    (v_acme,  v_bob,   'OWNER', now());

  -- ---------------- contenido ----------------
  insert into public.categories (tenant_id, kind, slug, name, position) values
    (v_rukma, 'BLOG',       'blog',            'Blog',             0),
    (v_rukma, 'CASE_STUDY', 'casos-de-estudio','Casos de Estudio', 1),
    (v_rukma, 'SERVICE',    'servicios',       'Servicios',        2);

  select id into v_cat from public.categories
  where tenant_id = v_rukma and slug = 'casos-de-estudio';

  insert into public.posts (
    tenant_id, category_id, author_id, slug, title, excerpt,
    status, published_at, content_json, content_html, custom_fields
  ) values (
    v_rukma, v_cat, v_alice,
    'rediseno-plataforma-fintech',
    'Rediseño de una plataforma fintech',
    'Cómo redujimos el tiempo de alta de 12 a 3 minutos.',
    'PUBLISHED', now(),
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"El reto era claro: el flujo de alta perdía al 60% de los usuarios."}]}]}',
    '<p>El reto era claro: el flujo de alta perdía al 60% de los usuarios.</p>',
    '{"cliente":"Fintech S.A.","duracion":"4 meses","demoUrl":"https://ejemplo.com"}'
  );

  insert into public.posts (tenant_id, author_id, slug, title, status, content_json)
  values (v_rukma, v_alice, 'borrador-en-curso', 'Borrador en curso', 'DRAFT',
          '{"type":"doc","content":[]}');

  -- Contenido del tenant B: si alguna vez aparece en el dashboard de
  -- Rukma Studio, el aislamiento está roto.
  insert into public.categories (tenant_id, kind, slug, name)
  values (v_acme, 'BLOG', 'noticias', 'Noticias');

  insert into public.posts (tenant_id, author_id, slug, title, status, published_at, content_json)
  values (v_acme, v_bob, 'nota-interna-acme', 'CONFIDENCIAL — Nota interna de ACME',
          'PUBLISHED', now(), '{"type":"doc","content":[]}');

  insert into public.webhooks (tenant_id, name, url, events)
  values (v_rukma, 'Revalidar web', 'https://rukma.studio/api/revalidate',
          array['post.published','post.updated','post.unpublished','post.deleted','addon.updated']::webhook_event[]);

  raise notice 'Seed listo — alice@rukma.studio / bob@acme.com / fcojhormazabalh@gmail.com (password123)';
end $$;
