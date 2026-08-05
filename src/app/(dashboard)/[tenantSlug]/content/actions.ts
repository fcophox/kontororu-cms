"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/guards";
import { renderContent, assertSafeEmbeds } from "@/lib/content/tiptap-to-html";
import { slugify, uniqueSlug, readingTime } from "@/lib/content/slug";

/**
 * Server Actions del CRUD de contenido.
 *
 * Cada acción es un endpoint público: se autentica y autoriza aquí dentro,
 * nunca se confía en que la UI haya ocultado el botón. Y por debajo sigue
 * estando RLS, que es la frontera real — estos guards existen para devolver
 * un error legible, no para proteger los datos.
 */

const ContentInput = z.object({
  postId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  slug: z.string().trim().max(80).optional(),
  excerpt: z.string().trim().max(400).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  contentJson: z.unknown(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(180).optional(),
      ogImage: z.string().url().optional(),
    })
    .default({}),
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> };

function parse(formData: FormData) {
  return ContentInput.safeParse({
    postId: formData.get("postId") || undefined,
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    excerpt: formData.get("excerpt") || undefined,
    categoryId: formData.get("categoryId") || null,
    contentJson: JSON.parse(String(formData.get("contentJson") ?? "{}")),
    customFields: JSON.parse(String(formData.get("customFields") ?? "{}")),
    seo: JSON.parse(String(formData.get("seo") ?? "{}")),
  });
}

// ---------------------------------------------------------------------
// Crear / actualizar
// ---------------------------------------------------------------------
export async function saveContent(
  tenantSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const input = parsed.data;

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.create")) {
    return { error: "No tienes permiso para editar contenido." };
  }

  const supabase = await createServerClient();

  let html: string;
  let text: string;
  try {
    ({ html, text } = renderContent(input.contentJson as never));
    assertSafeEmbeds(html);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Contenido no válido" };
  }

  const payload = {
    title: input.title,
    excerpt: input.excerpt ?? null,
    category_id: input.categoryId ?? null,
    content_json: input.contentJson as Json,
    content_html: html,
    custom_fields: input.customFields as Json,
    seo: input.seo as Json,
    reading_time: readingTime(text),
  };

  if (input.postId) {
    const { error } = await supabase
      .from("posts")
      .update(payload)
      .eq("id", input.postId);

    if (error) return { error: mapDbError(error.message) };

    revalidatePath(`/${tenantSlug}/content/${input.postId}`);
    revalidatePath(`/${tenantSlug}/content`);
    return {};
  }

  // Slug único dentro del tenant. La unicidad la garantiza el índice
  // UNIQUE(tenant_id, slug); esto sólo evita el error en el caso común.
  const { data: existing } = await supabase.from("posts").select("slug");
  const slug = uniqueSlug(
    input.slug || input.title,
    (existing ?? []).map((p) => p.slug as string),
  );

  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      ...payload,
      tenant_id: tenant.id,
      author_id: user.id,
      slug,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error) return { error: mapDbError(error.message) };

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content/${created.id}`);
}

// ---------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------
export async function publishContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para publicar.");
  }

  const supabase = await createServerClient();

  // published_at se fija sólo la primera vez: republicar no debe reordenar
  // el feed del cliente ni cambiar la fecha que ya indexó Google.
  const { data: current } = await supabase
    .from("posts")
    .select("published_at")
    .eq("id", postId)
    .single();

  const { error } = await supabase
    .from("posts")
    .update({
      status: "PUBLISHED",
      published_at: current?.published_at ?? new Date().toISOString(),
    })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger de Postgres ya encoló el webhook `post.published`.
  revalidatePath(`/${tenantSlug}/content`);
  revalidatePath(`/${tenantSlug}/content/${postId}`);
}

export async function unpublishContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para despublicar.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "DRAFT" })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));
  revalidatePath(`/${tenantSlug}/content`);
  revalidatePath(`/${tenantSlug}/content/${postId}`);
}

export async function archiveContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para archivar.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "ARCHIVED" })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));
  revalidatePath(`/${tenantSlug}/content`);
}

/**
 * Mueve a la papelera. Reversible.
 *
 * El esquema siempre tuvo `deleted_at` y todas las consultas lo filtran: el
 * borrado estaba pensado como papelera desde el principio, pero la acción
 * hacía un DELETE real. Un editor que se equivoca de fila perdía el trabajo
 * sin vuelta atrás.
 *
 * Para el exterior sí es una baja: el trigger emite `post.deleted` y la web
 * del cliente retira la página.
 */
export async function trashContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.delete")) {
    throw new Error("No tienes permiso para borrar contenido.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content?view=trash`);
}

export async function restoreContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.delete")) {
    throw new Error("No tienes permiso para restaurar contenido.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: null })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));
  revalidatePath(`/${tenantSlug}/content`);
}

/**
 * Borrado definitivo. Sin vuelta atrás.
 *
 * Sólo desde la papelera: obliga a dos decisiones separadas para destruir
 * algo. El contenido ya salió de la web del cliente al entrar en la papelera,
 * así que aquí no hay evento nuevo que emitir.
 */
export async function purgeContent(tenantSlug: string, postId: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.delete")) {
    throw new Error("No tienes permiso para borrar contenido.");
  }

  const supabase = await createServerClient();

  // Sólo se destruye lo que ya estaba en la papelera: si esta acción se
  // invocara por error sobre contenido vivo, no haría nada.
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .not("deleted_at", "is", null);

  if (error) throw new Error(mapDbError(error.message));
  revalidatePath(`/${tenantSlug}/content`);
}

// ---------------------------------------------------------------------
// Historial de versiones
// ---------------------------------------------------------------------
/**
 * Restaura el CUERPO de una versión anterior.
 *
 * No toca `slug` ni `status` a propósito. Restaurar es una operación sobre el
 * texto, y arrastrar el slug antiguo cambiaría en silencio la URL pública —
 * rompiendo enlaces que llevan meses funcionando— mientras que arrastrar el
 * estado podría despublicar un artículo vivo sin que nadie lo pidiera.
 *
 * Tampoco destruye nada: el propio guardado genera una versión nueva, así que
 * lo que había antes de restaurar sigue en el historial.
 */
export async function restoreRevision(
  tenantSlug: string,
  postId: string,
  revisionId: string,
) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.editAny")) {
    throw new Error("No tienes permiso para restaurar versiones.");
  }

  const supabase = await createServerClient();

  const { data: revision } = await supabase
    .from("post_revisions")
    .select("title, excerpt, content_json, content_html, custom_fields, seo, category_id")
    .eq("id", revisionId)
    .eq("post_id", postId)
    .maybeSingle();

  if (!revision) throw new Error("Esa versión ya no existe.");

  const { error } = await supabase
    .from("posts")
    .update({
      title: revision.title,
      excerpt: revision.excerpt,
      content_json: revision.content_json,
      content_html: revision.content_html,
      custom_fields: revision.custom_fields,
      seo: revision.seo,
      category_id: revision.category_id,
    })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));

  revalidatePath(`/${tenantSlug}/content/${postId}`);
  revalidatePath(`/${tenantSlug}/content`);
}

// ---------------------------------------------------------------------
// Slug editable a mano
// ---------------------------------------------------------------------
export type SlugState = { error?: string; slug?: string };

/**
 * Cambia la URL pública del contenido.
 *
 * Devuelve el error en vez de lanzarlo: "esa URL ya está en uso" es una
 * corrección normal del usuario, y romper con un error boundary por eso sería
 * desproporcionado.
 *
 * Al guardar, el webhook lleva `previousSlug` para que la web del cliente
 * pueda invalidar también la dirección antigua — sin eso, la página vieja se
 * queda publicada en su sitio para siempre.
 */
export async function updateSlug(
  tenantSlug: string,
  postId: string,
  _prev: SlugState,
  formData: FormData,
): Promise<SlugState> {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.editAny")) {
    return { error: "No tienes permiso para cambiar la URL." };
  }

  const slug = slugify(String(formData.get("slug") ?? ""));
  if (!slug) return { error: "La URL no puede quedar vacía." };

  const supabase = await createServerClient();
  const { error } = await supabase.from("posts").update({ slug }).eq("id", postId);

  if (error) return { error: mapDbError(error.message) };

  revalidatePath(`/${tenantSlug}/content/${postId}`);
  revalidatePath(`/${tenantSlug}/content`);
  return { slug };
}

/**
 * Los errores de Postgres son correctos pero ilegibles para un editor de
 * contenidos. Se traducen los conocidos y se deja pasar el resto sin
 * exponer detalles del esquema.
 */
function mapDbError(message: string): string {
  if (message.includes("posts_tenant_id_slug_key")) {
    return "Ya existe contenido con esa URL en este espacio.";
  }
  if (message.includes("posts_published_needs_date")) {
    return "Un contenido publicado necesita fecha de publicación.";
  }
  if (message.includes("pertenece a otro tenant")) {
    return "La categoría seleccionada no pertenece a este espacio.";
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "No tienes permiso para realizar esta acción.";
  }
  return "No se pudo guardar. Inténtalo de nuevo.";
}

// ---------------------------------------------------------------------
// Traducciones
// ---------------------------------------------------------------------
/**
 * Crea la versión de un contenido en otro idioma.
 *
 * Copia el cuerpo original como punto de partida y lo deja en BORRADOR: nadie
 * quiere publicar sin querer un artículo en inglés que todavía está en
 * español. La categoría no se arrastra porque pertenece a otro idioma — el
 * trigger lo rechazaría — y el slug lleva sufijo si ya está ocupado.
 */
export async function createTranslation(
  tenantSlug: string,
  postId: string,
  locale: string,
) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.create")) {
    throw new Error("No tienes permiso para crear contenido.");
  }
  if (!tenant.locales.includes(locale)) {
    throw new Error(`El idioma "${locale}" no está activado en este espacio.`);
  }

  const supabase = await createServerClient();

  const { data: source } = await supabase
    .from("posts")
    .select("title, excerpt, content_json, content_html, custom_fields, seo, translation_group_id, slug")
    .eq("id", postId)
    .maybeSingle();

  if (!source) throw new Error("Ese contenido ya no existe.");

  const { data: existing } = await supabase
    .from("posts")
    .select("slug")
    .eq("tenant_id", tenant.id)
    .eq("locale", locale);

  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      tenant_id: tenant.id,
      author_id: user.id,
      locale,
      // Lo que une las traducciones: mismo grupo, distinto idioma.
      translation_group_id: source.translation_group_id,
      slug: uniqueSlug(source.slug, (existing ?? []).map((p) => p.slug as string)),
      title: source.title,
      excerpt: source.excerpt,
      content_json: source.content_json,
      content_html: source.content_html,
      custom_fields: source.custom_fields,
      seo: source.seo,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("posts_group_locale_key")) {
      throw new Error("Ya existe una traducción a ese idioma.");
    }
    throw new Error(mapDbError(error.message));
  }

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content/${created.id}`);
}
