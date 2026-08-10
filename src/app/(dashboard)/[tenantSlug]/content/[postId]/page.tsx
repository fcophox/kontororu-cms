import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { createServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/guards";
import { asJsonContent, asRecord, asSeo } from "@/lib/content/json";
import { refreshContentMedia } from "@/lib/api/content-media";
import { signMediaBatch } from "@/lib/api/serializers";
import { createServiceClient } from "@/lib/supabase/server";
import { PostEditor } from "@/components/editor/post-editor";
import { PostSidebarActions } from "@/components/editor/post-sidebar-actions";
import { PostHistory } from "@/components/editor/post-history";
import { PostTranslations } from "@/components/editor/post-translations";
import {
  saveContent,
  publishContent,
  unpublishContent,
  archiveContent,
  trashContent,
  restoreContent,
  updateSlug,
  restoreRevision,
  createTranslation,
  type ActionState,
  type SlugState,
} from "../actions";

type Props = { params: Promise<{ tenantSlug: string; postId: string }> };

export async function generateMetadata({ params }: Props) {
  const { tenantSlug, postId } = await params;
  await getTenantContext(tenantSlug);

  const supabase = await createServerClient();
  const { data } = await supabase.from("posts").select("title").eq("id", postId).maybeSingle();

  return { title: data?.title ?? "Editar" };
}

export default async function EditContentPage({ params }: Props) {
  const { tenantSlug, postId } = await params;
  const { tenant, role, user } = await getTenantContext(tenantSlug);

  const supabase = await createServerClient();

  const [{ data: post }, { data: categories }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, slug, title, excerpt, category_id, content_json, content_html, custom_fields, seo, status, author_id, deleted_at, locale, translation_group_id, cover_media_id, published_at, cover:media(id, bucket, path, provider, alt_text, width, height)",
      )
      .eq("id", postId)
      .maybeSingle(),
    supabase.from("categories").select("id, name").order("position"),
  ]);

  // El historial se pide aparte porque sólo interesa en edición, y así el
  // fallo de una consulta accesoria no impide abrir el editor.
  const { data: revisions } = await supabase
    .from("post_revisions")
    .select("id, version, title, content_html, created_at, author:users_profiles(full_name, email)")
    .eq("post_id", postId)
    .order("version", { ascending: false })
    .limit(30);


  // Si RLS lo filtró, el post existe pero no es de este usuario: mismo 404
  // que si no existiera. No se distingue una cosa de la otra a propósito.
  if (!post) notFound();
  // Hermanas de este contenido: mismo grupo, otros idiomas.
  const { data: siblings } = await supabase
    .from("posts")
    .select("id, locale, status")
    .eq("translation_group_id", post.translation_group_id)
    .neq("id", postId)
    .is("deleted_at", null)
    .order("locale");

  const isOwnDraft = post.author_id === user.id && post.status === "DRAFT";
  const canEdit =
    user.isSuperadmin || can(role, "content.editAny") || isOwnDraft;
  const canPublish = user.isSuperadmin || can(role, "content.publish");

  if (!canEdit) notFound();

  // Mismo refirmado que en la API: sin esto, abrir un contenido de hace más
  // de una semana muestra los huecos de las imágenes, y guardarlo volvería a
  // persistir los src caducados.
  const content = await refreshContentMedia(createServiceClient(), tenant.id, {
    html: "",
    json: asJsonContent(post.content_json),
  });

  let coverUrl: string | null = null;
  const coverMedia = post.cover as Parameters<typeof signMediaBatch>[1][number];
  if (coverMedia) {
    const signed = await signMediaBatch(createServiceClient(), [coverMedia]);
    coverUrl = signed.get(coverMedia.path) ?? null;
  }

  const save = async (prev: ActionState, formData: FormData) => {
    "use server";
    return saveContent(tenantSlug, prev, formData);
  };
  const publish = async () => {
    "use server";
    await publishContent(tenantSlug, postId);
  };
  const unpublish = async () => {
    "use server";
    await unpublishContent(tenantSlug, postId);
  };
  const changeSlug = async (prev: SlugState, formData: FormData) => {
    "use server";
    return updateSlug(tenantSlug, postId, prev, formData);
  };
  const archive = async () => {
    "use server";
    await archiveContent(tenantSlug, postId);
  };
  const trash = async () => {
    "use server";
    await trashContent(tenantSlug, postId);
  };
  const restore = async () => {
    "use server";
    await restoreContent(tenantSlug, postId);
  };
  const restoreVersion = async (revisionId: string) => {
    "use server";
    await restoreRevision(tenantSlug, postId, revisionId);
  };
  const translate = async (locale: string) => {
    "use server";
    await createTranslation(tenantSlug, postId, locale);
  };

  return (
    <PostEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      categories={categories ?? []}
      canPublish={canPublish}
      saveAction={save}
      onPublish={publish}
      onUnpublish={unpublish}
      lifecycle={
        <PostSidebarActions
          slug={post.slug}
          status={post.status}
          isPublished={post.status === "PUBLISHED"}
          canEditSlug={user.isSuperadmin || can(role, "content.editAny")}
          canDelete={user.isSuperadmin || can(role, "content.delete")}
          isTrashed={post.deleted_at !== null}
          updateSlugAction={changeSlug}
          archiveAction={archive}
          trashAction={trash}
          restoreAction={restore}
        />
      }
      translations={
        <PostTranslations
          currentLocale={post.locale}
          translations={(siblings ?? []).map((t) => ({
            id: t.id,
            locale: t.locale,
            status: t.status,
          }))}
          availableLocales={tenant.locales}
          tenantSlug={tenantSlug}
          canCreate={user.isSuperadmin || can(role, "content.create")}
          createAction={translate}
        />
      }
      history={
        <PostHistory
          currentSize={(post.content_html ?? "").length}
          canRestore={user.isSuperadmin || can(role, "content.editAny")}
          restoreAction={restoreVersion}
          revisions={(revisions ?? []).map((r) => {
            const author = r.author as unknown as {
              full_name: string | null;
              email: string;
            } | null;
            return {
              id: r.id,
              version: r.version,
              title: r.title,
              author: author?.full_name ?? author?.email ?? null,
              createdAt: r.created_at,
              size: (r.content_html ?? "").length,
            };
          })}
        />
      }
      draft={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        categoryId: post.category_id,
        coverMediaId: post.cover_media_id,
        coverUrl,
        contentJson: asJsonContent(content.json),
        customFields: asRecord(post.custom_fields),
        seo: asSeo(post.seo),
        status: post.status,
        publishedAt: post.published_at,
      }}
    />
  );
}
