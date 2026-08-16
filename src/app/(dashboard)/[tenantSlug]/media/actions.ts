"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { can } from "@/lib/auth/guards";
import { createStorageAdapter } from "@/lib/storage/factory";

const AltInput = z.string().trim().max(200);

/**
 * El texto alternativo no es decorativo: es lo que leen los lectores de
 * pantalla en la web del cliente, y viaja en la API junto a la imagen.
 */
export async function updateAltText(tenantSlug: string, mediaId: string, alt: string) {
  const parsed = AltInput.safeParse(alt);
  if (!parsed.success) throw new Error("Texto alternativo demasiado largo.");

  const { tenant } = await getTenantContext(tenantSlug);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("media")
    .update({ alt_text: parsed.data || null })
    .eq("id", mediaId)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error("No se pudo guardar el texto alternativo.");
  revalidatePath(`/${tenantSlug}/media`);
}

export async function deleteMedia(tenantSlug: string, mediaId: string) {
  const { tenant, role, user } = await getTenantContext(tenantSlug);
  const supabase = await createServerClient();

  const { data: media } = await supabase
    .from("media")
    .select("bucket, path, provider, uploaded_by")
    .eq("id", mediaId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!media) throw new Error("El archivo ya no existe.");

  const ownUpload = media.uploaded_by === user.id;
  if (!user.isSuperadmin && !can(role, "media.deleteAny") && !ownUpload) {
    throw new Error("Sólo puedes borrar los archivos que has subido tú.");
  }

  // Primero la fila, después el objeto. Al revés, un fallo al borrar la fila
  // dejaría referencias en posts apuntando a un archivo inexistente.
  const { error } = await supabase
    .from("media")
    .delete()
    .eq("id", mediaId)
    .eq("tenant_id", tenant.id);
  if (error) throw new Error("No se pudo eliminar el archivo.");

  const storage = createStorageAdapter(media.provider, media.bucket, supabase);
  await storage.remove(media.bucket, [media.path]).catch(() => {
    // El objeto huérfano no rompe nada visible; lo recoge una limpieza
    // periódica. Fallar aquí sí confundiría al usuario: la fila ya no está.
  });

  revalidatePath(`/${tenantSlug}/media`);
}
