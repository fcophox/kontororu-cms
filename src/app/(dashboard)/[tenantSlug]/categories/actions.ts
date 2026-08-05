"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/guards";
import { slugify, uniqueSlug } from "@/lib/content/slug";

const CategoryInput = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  kind: z.enum(["BLOG", "CASE_STUDY", "SERVICE", "CUSTOM"]),
  description: z.string().trim().max(300).optional(),
});

export type CategoryState = { error?: string };

export async function createCategory(
  tenantSlug: string,
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const parsed = CategoryInput.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors.name?.[0] ?? "Datos no válidos" };
  }

  const { tenant, role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "taxonomy.manage")) {
    return { error: "No tienes permiso para gestionar categorías." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase.from("categories").select("slug");

  const { error } = await supabase.from("categories").insert({
    tenant_id: tenant.id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    description: parsed.data.description ?? null,
    slug: uniqueSlug(parsed.data.name, (existing ?? []).map((c) => c.slug as string)),
  });

  if (error) return { error: "No se pudo crear la categoría." };

  revalidatePath(`/${tenantSlug}/categories`);
  return {};
}

export async function renameCategory(tenantSlug: string, id: string, name: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "taxonomy.manage")) {
    throw new Error("No tienes permiso para gestionar categorías.");
  }
  if (!slugify(name)) throw new Error("Nombre no válido.");

  const supabase = await createServerClient();
  // El slug NO se regenera al renombrar: cambiarlo rompería las URLs que el
  // front-end del cliente ya tiene publicadas e indexadas.
  const { error } = await supabase.from("categories").update({ name }).eq("id", id);
  if (error) throw new Error("No se pudo renombrar la categoría.");

  revalidatePath(`/${tenantSlug}/categories`);
}

export async function deleteCategory(tenantSlug: string, id: string) {
  const { role, user } = await getTenantContext(tenantSlug);
  if (!user.isSuperadmin && !can(role, "taxonomy.manage")) {
    throw new Error("No tienes permiso para gestionar categorías.");
  }

  const supabase = await createServerClient();
  // Los posts NO se borran: la FK es ON DELETE SET NULL, así que quedan
  // sin categoría. Borrar una categoría nunca debe destruir contenido.
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la categoría.");

  revalidatePath(`/${tenantSlug}/categories`);
  revalidatePath(`/${tenantSlug}/content`);
}
