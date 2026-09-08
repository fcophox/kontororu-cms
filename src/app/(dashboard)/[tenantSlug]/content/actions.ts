"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/guards";
import { renderContent, assertSafeEmbeds } from "@/lib/content/tiptap-to-html";
import { slugify, uniqueSlug, readingTime } from "@/lib/content/slug";
import { translateJsonContent, translateText } from "@/lib/content/translate";
import { asJsonContent, asSeo } from "@/lib/content/json";
import { alignFields, hasSameFieldKeys, unionFieldKeys } from "@/lib/content/custom-fields";
import { dispatchNow } from "@/lib/content/webhook-dispatch";

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
  coverMediaId: z.string().uuid().nullable().optional(),
  contentJson: z.unknown(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(180).optional(),
      ogImage: z.string().url().optional(),
    })
    .default({}),
  publishedAt: z.string().trim().nullable().optional(),
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Texto del que sale el slug: el título traducido al inglés.
 *
 * El fallo del traductor NO puede impedir guardar. Un servicio externo caído
 * haría imposible crear contenido, y la penalización de tener una URL en
 * español es que sea menos legible fuera — no que se pierda el trabajo.
 */
async function englishSlugSource(title: string): Promise<string> {
  try {
    return await translateText(title, "en");
  } catch (err) {
    console.error("No se pudo traducir el título para el slug", err);
    return title;
  }
}

function parse(formData: FormData) {
  return ContentInput.safeParse({
    postId: formData.get("postId") || undefined,
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    excerpt: formData.get("excerpt") || undefined,
    categoryId: formData.get("categoryId") || null,
    coverMediaId: formData.get("coverMediaId") || null,
    contentJson: JSON.parse(String(formData.get("contentJson") ?? "{}")),
    customFields: JSON.parse(String(formData.get("customFields") ?? "{}")),
    seo: JSON.parse(String(formData.get("seo") ?? "{}")),
    publishedAt: formData.get("publishedAt") || null,
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
    cover_media_id: input.coverMediaId ?? null,
    content_json: input.contentJson as Json,
    content_html: html,
    custom_fields: input.customFields as Json,
    seo: input.seo as Json,
    reading_time: readingTime(text),
    published_at: input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
  };

  if (input.postId) {
    const { data: updated, error } = await supabase
      .from("posts")
      .update(payload)
      .eq("id", input.postId)
      .eq("tenant_id", tenant.id)
      .select("translation_group_id")
      .maybeSingle();

    if (error) return { error: mapDbError(error.message) };

    /*
     * La portada y la categoría son UNA para todas las traducciones.
     *
     * Es la misma foto y la misma sección del mismo artículo. Obligar a
     * elegirlas en cada idioma duplica el trabajo y, en cuanto alguien cambia
     * una y olvida la otra, la web enseña una imagen —o clasifica la entrada—
     * distinta según el idioma del visitante.
     *
     * La categoría dejó de tener idioma en `categories_transversal`: "Blog" es
     * la misma tanto si clasifica el español como el inglés, así que asignarla
     * es una decisión sobre el contenido, no sobre una de sus versiones.
     *
     * Se propagan al guardar y no sólo al traducir porque el problema no es
     * crear la traducción —eso ya las copiaba— sino que las dos versiones se
     * separen después, al editar una de ellas.
     */
    if (updated?.translation_group_id) {
      const { error: sharedError } = await supabase
        .from("posts")
        .update({
          cover_media_id: payload.cover_media_id,
          category_id: payload.category_id,
        })
        .eq("translation_group_id", updated.translation_group_id)
        .neq("id", input.postId);

      // Lo compartido no puede tumbar el guardado: el contenido que el editor
      // acaba de escribir ya está a salvo.
      if (sharedError) {
        console.error(
          "No se pudieron propagar la portada y la categoría a las traducciones",
          sharedError,
        );
      }

      await syncCustomFieldKeys(
        supabase,
        updated.translation_group_id,
        input.postId,
        payload.custom_fields,
      );
    }

    // El trigger acaba de encolar el evento; se entrega YA, sin esperar al
    // turno del cron. `after()` lo saca del camino crítico: el editor ve su
    // cambio guardado sin quedarse mirando la petición a la web del cliente.
    after(() => dispatchNow(tenant.id));

    revalidatePath(`/${tenantSlug}/content/${input.postId}`);
    revalidatePath(`/${tenantSlug}/content`);
    return {};
  }

  /*
   * El slug se genera SIEMPRE en inglés, aunque el contenido esté en español.
   *
   * Es la misma URL para todos los idiomas del contenido: la traducción la
   * hereda en lugar de inventarse la suya. Antes cada idioma tenía su slug y
   * la dirección cambiaba al cambiar de idioma, lo que obliga a la web a saber
   * el slug de cada lengua para poder enlazarlas.
   *
   * Si el editor escribe el slug a mano, manda el suyo: la traducción
   * automática es una comodidad, no una imposición.
   */
  const { data: existing } = await supabase
    .from("posts")
    .select("slug")
    .eq("tenant_id", tenant.id);
  const slug = uniqueSlug(
    input.slug || (await englishSlugSource(input.title)),
    (existing ?? []).map((p) => p.slug as string),
  );

  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      ...payload,
      tenant_id: tenant.id,
      author_id: user.id,
      slug,
      // Sin esto cae el `default 'es'` de la columna, y en un espacio cuyo
      // idioma principal no sea el español el trigger `posts_assert_locale`
      // rechaza el guardado sin explicar por qué.
      locale: tenant.defaultLocale,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error) return { error: mapDbError(error.message) };

  // Una traducción de un contenido publicado nace publicada, y el trigger
  // acaba de encolar su `post.published`: se entrega ya, sin esperar al cron,
  // o la web del cliente tardaría hasta un turno en enterarse de la URL nueva.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content/${created.id}`);
}

// ---------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------
/**
 * Publica el contenido Y sus traducciones.
 *
 * Publicar un solo idioma dejaba la web a medias: el conmutador de idioma
 * apuntaba a una versión en borrador y el visitante recibía un 404. Como cada
 * idioma es una fila, "publicar este contenido" tiene que alcanzar al grupo
 * entero.
 *
 * Las ARCHIVED se quedan fuera: archivar una versión es una decisión explícita
 * sobre ella, y republicar el original no debería deshacerla.
 *
 * `published_at` se fija sólo la primera vez —republicar no debe reordenar el
 * feed ni cambiar la fecha que ya indexó Google— y una traducción sin fecha
 * hereda la del original, para que las dos ocupen el mismo sitio en el listado
 * público.
 */
export async function publishContent(tenantSlug: string, postId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para publicar.");
  }

  const supabase = await createServerClient();

  const { data: current } = await supabase
    .from("posts")
    .select("published_at, translation_group_id")
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!current) throw new Error("Ese contenido ya no existe.");

  const publishedAt = current.published_at ?? new Date().toISOString();

  const { data: group } = await supabase
    .from("posts")
    .select("id, published_at")
    .eq("translation_group_id", current.translation_group_id)
    .neq("status", "ARCHIVED")
    .is("deleted_at", null);

  // Una fila por idioma en vez de un update en bloque: cada una conserva su
  // propia `published_at` si ya la tenía. El trigger de Postgres encola un
  // webhook `post.published` por fila, que es justo lo que la web del cliente
  // necesita para invalidar cada URL.
  for (const sibling of group ?? []) {
    const { error } = await supabase
      .from("posts")
      .update({
        status: "PUBLISHED",
        published_at: sibling.published_at ?? publishedAt,
      })
      .eq("id", sibling.id);

    if (error) throw new Error(mapDbError(error.message));
    revalidatePath(`/${tenantSlug}/content/${sibling.id}`);
  }

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content`);
}

/**
 * Retira el contenido y sus traducciones.
 *
 * Simétrico a `publishContent` por la misma razón: dejar el inglés publicado
 * tras retirar el español deja en la web una página a la que ya no lleva
 * ningún enlace y de la que no se puede volver.
 */
export async function unpublishContent(tenantSlug: string, postId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para despublicar.");
  }

  const supabase = await createServerClient();

  const { data: current } = await supabase
    .from("posts")
    .select("translation_group_id")
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!current) throw new Error("Ese contenido ya no existe.");

  const { error } = await supabase
    .from("posts")
    .update({ status: "DRAFT" })
    .eq("translation_group_id", current.translation_group_id)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content`);
  revalidatePath(`/${tenantSlug}/content/${postId}`);
}

export async function archiveContent(tenantSlug: string, postId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.publish")) {
    throw new Error("No tienes permiso para archivar.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "ARCHIVED" })
    .eq("id", postId)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

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
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.delete")) {
    throw new Error("No tienes permiso para borrar contenido.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content?view=trash`);
}

export async function restoreContent(tenantSlug: string, postId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.delete")) {
    throw new Error("No tienes permiso para restaurar contenido.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ deleted_at: null })
    .eq("id", postId)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

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
  const { tenant, role, user } = await getTenantContext(tenantSlug);
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
    .eq("tenant_id", tenant.id)
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
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.editAny")) {
    throw new Error("No tienes permiso para restaurar versiones.");
  }

  const supabase = await createServerClient();

  const { data: revision } = await supabase
    .from("post_revisions")
    .select("title, excerpt, content_json, content_html, custom_fields, seo, category_id")
    .eq("id", revisionId)
    .eq("post_id", postId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!revision) throw new Error("Esa versión ya no existe.");

  const { data: restored, error } = await supabase
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
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .select("translation_group_id")
    .maybeSingle();

  if (error) throw new Error(mapDbError(error.message));

  // La categoría es del contenido, no de esta versión: si restaurar la cambia,
  // la cambia para todos los idiomas. De lo contrario el español volvería a
  // "Blog" y el inglés se quedaría en la categoría de después, que es
  // exactamente el descuadre que se acaba de arreglar en el guardado.
  if (restored?.translation_group_id) {
    const { error: categoryError } = await supabase
      .from("posts")
      .update({ category_id: revision.category_id })
      .eq("translation_group_id", restored.translation_group_id)
      .neq("id", postId);

    if (categoryError) {
      console.error("No se pudo propagar la categoría restaurada", categoryError);
    }
  }

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content/${postId}`);
  revalidatePath(`/${tenantSlug}/content`);
}

// ---------------------------------------------------------------------
// Slug editable a mano
// ---------------------------------------------------------------------
export type SlugState = { error?: string; slug?: string };

/**
 * Cambia la URL pública del contenido, en todos sus idiomas.
 *
 * El slug es del CONTENIDO, no de cada traducción: una misma noticia tiene la
 * misma dirección en español y en inglés. Cambiarlo sólo en la fila abierta
 * las haría divergir de nuevo, que es justo lo que se quería evitar.
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
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.editAny")) {
    return { error: "No tienes permiso para cambiar la URL." };
  }

  const slug = slugify(String(formData.get("slug") ?? ""));
  if (!slug) return { error: "La URL no puede quedar vacía." };

  const supabase = await createServerClient();

  const { data: current } = await supabase
    .from("posts")
    .select("translation_group_id")
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!current) return { error: "Ese contenido ya no existe." };

  const { data: updated, error } = await supabase
    .from("posts")
    .update({ slug })
    .eq("translation_group_id", current.translation_group_id)
    .is("deleted_at", null)
    .select("id");

  if (error) return { error: mapDbError(error.message) };

  // Aquí corre especial prisa: hasta que no llegue el webhook con
  // `previousSlug`, la web del cliente sirve la URL vieja Y la nueva.
  after(() => dispatchNow(tenant.id));

  for (const row of updated ?? []) {
    revalidatePath(`/${tenantSlug}/content/${row.id}`);
  }
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

/**
 * Iguala las claves de campos personalizados en el resto de idiomas.
 *
 * Un campo personalizado es del contenido, no de una de sus versiones: si la
 * web pide `duracion`, tiene que venir tanto en español como en inglés. Antes
 * sólo se copiaban al crear la traducción, así que cualquier campo añadido
 * después existía en un idioma y faltaba en el otro.
 *
 * Se propaga la CLAVE y no el valor: "3 meses" y "3 months" son el mismo campo
 * con texto distinto. Las nuevas entran vacías y lo ya escrito no se toca.
 *
 * Mismo trato que la portada: si falla, se registra y ya. El contenido que el
 * editor acaba de escribir está guardado, y tumbar el guardado por no haber
 * podido alinear una clave en otro idioma sería peor que la desalineación.
 */
async function syncCustomFieldKeys(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  postId: string,
  customFields: Json,
) {
  const keys = unionFieldKeys(customFields);

  const { data: siblings, error } = await supabase
    .from("posts")
    .select("id, custom_fields")
    .eq("translation_group_id", groupId)
    .neq("id", postId);

  if (error) {
    console.error("No se pudieron leer las traducciones para alinear campos", error);
    return;
  }

  for (const sibling of siblings ?? []) {
    // Sin cambio de claves no se escribe: cada escritura genera revisión, y
    // sincronizar no es una edición que merezca salir en el historial.
    if (hasSameFieldKeys(sibling.custom_fields, keys)) continue;

    const { error: fieldsError } = await supabase
      .from("posts")
      .update({ custom_fields: alignFields(sibling.custom_fields, keys) as Json })
      .eq("id", sibling.id);

    if (fieldsError) {
      console.error("No se pudieron alinear los campos de una traducción", fieldsError);
    }
  }
}

// ---------------------------------------------------------------------
// Traducciones
// ---------------------------------------------------------------------
/**
 * Crea la versión de un contenido en otro idioma, ya traducida.
 *
 * Antes copiaba el cuerpo tal cual, y la "versión en inglés" nacía con el
 * texto en español: había que traducirla fuera del CMS y pegarla de vuelta.
 * Ahora se traduce el título, el extracto, el SEO y el cuerpo.
 *
 * Arrastra además portada, fechas y categoría. Sin ellas la traducción salía
 * a la web sin imagen, sin fecha y fuera de todo listado: técnicamente
 * publicada, invisible en la práctica.
 *
 * HEREDA EL ESTADO del original. Publicar es una decisión sobre el contenido,
 * no sobre un idioma: si el artículo ya está publicado, traducirlo no debería
 * dejar media web sin la versión inglesa hasta que alguien se acuerde de
 * volver a pulsar Publicar. Traducir un borrador sigue dando un borrador.
 *
 * El precio es que la traducción automática sale a la web sin revisar; a
 * cambio, no hay contenidos publicados a medias. Retocarla después es editar
 * y guardar, como cualquier otra entrada.
 *
 * El slug lleva sufijo si ya está ocupado.
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
    .select(
      "title, excerpt, content_json, content_html, custom_fields, seo, translation_group_id, slug, category_id, cover_media_id, published_at, scheduled_for, status",
    )
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!source) throw new Error("Ese contenido ya no existe.");

  const { data: existing } = await supabase
    .from("posts")
    .select("slug")
    .eq("tenant_id", tenant.id)
    .eq("locale", locale);

  const translated = await translateSource(source, locale);
  // Las categorías no tienen idioma: la traducción se queda en la misma.
  const categoryId = source.category_id;

  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      tenant_id: tenant.id,
      author_id: user.id,
      locale,
      // Lo que une las traducciones: mismo grupo, distinto idioma.
      translation_group_id: source.translation_group_id,
      /*
       * La traducción HEREDA el slug del original.
       *
       * Es la misma noticia, así que es la misma URL en todos los idiomas.
       * Generar aquí un slug propio hacía que la dirección cambiara al
       * cambiar de idioma, y obligaba a la web a conocer el slug de cada
       * lengua para poder enlazarlas.
       *
       * El índice de unicidad es (tenant, idioma, slug), así que repetirlo en
       * otro idioma es legítimo. El sufijo sólo entra si ESE idioma ya tenía
       * ocupada la dirección por otro contenido.
       */
      slug: uniqueSlug(
        source.slug,
        (existing ?? []).map((p) => p.slug as string),
      ),
      title: translated.title,
      excerpt: translated.excerpt,
      content_json: translated.content_json,
      content_html: translated.content_html,
      custom_fields: source.custom_fields,
      seo: translated.seo,
      // La portada es la misma imagen: los medios no tienen idioma.
      cover_media_id: source.cover_media_id,
      // Las fechas se heredan para que la traducción ocupe en el feed el mismo
      // sitio que el original. `published_at` en un BORRADOR no publica nada:
      // sólo evita que al publicarla se le ponga la fecha de hoy y aparezca
      // como si fuera un artículo nuevo.
      published_at: source.published_at,
      scheduled_for: source.scheduled_for,
      category_id: categoryId,
      // ARCHIVED no se hereda: archivar es una decisión sobre UNA versión, y
      // una traducción recién creada no nace retirada.
      status: source.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("posts_group_locale_key")) {
      throw new Error("Ya existe una traducción a ese idioma.");
    }
    throw new Error(mapDbError(error.message));
  }

  // Una traducción de un contenido publicado nace publicada, y el trigger
  // acaba de encolar su `post.published`: se entrega ya, sin esperar al cron,
  // o la web del cliente tardaría hasta un turno en enterarse de la URL nueva.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content`);
  redirect(`/${tenantSlug}/content/${created.id}`);
}

/**
 * Vuelve a traducir sobre una traducción que ya existe.
 *
 * El original sigue vivo: se corrigen erratas, se añaden párrafos. Sin esta
 * acción, la única forma de arrastrar esos cambios al inglés sería borrar la
 * traducción y crearla de nuevo, perdiendo su URL —ya indexada— y su
 * historial.
 *
 * Sobrescribe el cuerpo, y por eso NO toca el slug ni el estado: la dirección
 * pública no cambia bajo los pies de nadie. Lo anterior queda en el historial
 * de versiones, porque el guardado genera revisión.
 *
 * Portada, fechas y categoría sólo se rellenan si faltan. Así se reparan las
 * traducciones creadas antes de que se heredaran, sin pisar una portada o una
 * categoría que alguien haya elegido a mano para este idioma.
 */
export async function retranslateContent(tenantSlug: string, postId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "content.editAny")) {
    throw new Error("No tienes permiso para editar esta traducción.");
  }

  const supabase = await createServerClient();

  const { data: target } = await supabase
    .from("posts")
    .select("locale, translation_group_id, category_id, cover_media_id, published_at, scheduled_for")
    .eq("id", postId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!target) throw new Error("Ese contenido ya no existe.");

  // El origen es la hermana del idioma por defecto del espacio; si no existe,
  // cualquier otra del grupo. Traducir desde una traducción degrada el texto,
  // así que se prefiere siempre el idioma original.
  const { data: siblings } = await supabase
    .from("posts")
    .select("id, locale, title, excerpt, content_json, seo, category_id, cover_media_id, published_at, scheduled_for")
    .eq("translation_group_id", target.translation_group_id)
    .neq("id", postId)
    .is("deleted_at", null);

  const source =
    (siblings ?? []).find((s) => s.locale === tenant.defaultLocale) ?? (siblings ?? [])[0];

  if (!source) throw new Error("No hay contenido original desde el que traducir.");

  const translated = await translateSource(source, target.locale);

  // Las categorías no tienen idioma: si la traducción aún no tiene una, hereda
  // la del original sin necesidad de buscar ni crear una equivalente.
  const categoryId = target.category_id ?? source.category_id;

  const { error } = await supabase
    .from("posts")
    .update({
      title: translated.title,
      excerpt: translated.excerpt,
      content_json: translated.content_json,
      content_html: translated.content_html,
      seo: translated.seo,
      category_id: categoryId,
      // La portada es una sola para el grupo, así que manda la del original en
      // vez de conservar la del destino: si alguna vez se separaron, retraducir
      // las vuelve a juntar.
      cover_media_id: source.cover_media_id,
      published_at: target.published_at ?? source.published_at,
      scheduled_for: target.scheduled_for ?? source.scheduled_for,
    })
    .eq("id", postId);

  if (error) throw new Error(mapDbError(error.message));

  // El trigger acaba de encolar el evento; se entrega YA, sin esperar al turno
  // del cron. `after()` lo saca del camino crítico: el editor ve su cambio
  // guardado sin quedarse mirando la petición a la web del cliente.
  after(() => dispatchNow(tenant.id));

  revalidatePath(`/${tenantSlug}/content/${postId}`);
  revalidatePath(`/${tenantSlug}/content`);
}

/**
 * Traduce los campos redactables de un contenido.
 *
 * El HTML se vuelve a renderizar desde el JSON traducido en vez de traducirse
 * aparte: es la misma función que usa el guardado, así que la traducción pasa
 * por el mismo sanitizado que cualquier otro contenido.
 */
async function translateSource(
  source: {
    title: string;
    excerpt: string | null;
    content_json: unknown;
    seo: unknown;
  },
  locale: string,
): Promise<{
  title: string;
  excerpt: string | null;
  content_json: Json;
  content_html: string;
  seo: Json;
}> {
  const seo = asSeo(source.seo);

  const [title, excerpt, seoTitle, seoDescription, contentJson] = await Promise.all([
    translateText(source.title, locale),
    source.excerpt ? translateText(source.excerpt, locale) : Promise.resolve(null),
    seo.title ? translateText(seo.title, locale) : Promise.resolve(undefined),
    seo.description ? translateText(seo.description, locale) : Promise.resolve(undefined),
    translateJsonContent(asJsonContent(source.content_json), locale),
  ]);

  const { html } = renderContent(contentJson);
  assertSafeEmbeds(html);

  return {
    title,
    excerpt,
    content_json: contentJson as Json,
    content_html: html,
    seo: { ...seo, title: seoTitle, description: seoDescription } as Json,
  };
}
