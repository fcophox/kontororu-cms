import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createStorageAdapter } from "@/lib/storage/factory";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from "@/lib/storage/adapter";
import { asLimits, asUsage } from "@/lib/content/json";
import { readImageSize } from "@/lib/storage/image-size";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const tenantId = String(form.get("tenantId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx. 25 MB)" }, { status: 413 });
  }

  // Pertenencia al tenant: la lee RLS, no confiamos en el tenantId del cliente.
  const { data: membership } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Sin acceso a este tenant" }, { status: 403 });
  }

  // Cuota de almacenamiento del plan
  const { data: tenant } = await supabase
    .from("tenants")
    .select("limits, storage_bucket, storage_provider")
    .eq("id", tenantId)
    .single();

  const { data: usageRaw } = await supabase.rpc("tenant_usage", { p_tenant: tenantId });
  const usage = asUsage(usageRaw);
  const maxMb = asLimits(tenant?.limits).maxStorageMb;
  if (maxMb > 0 && usage.storageMb + file.size / 1048576 > maxMb) {
    return NextResponse.json({ error: "Cuota de almacenamiento superada" }, { status: 507 });
  }

  // Se leen las dimensiones antes de subir: el buffer ya está en memoria y
  // así viajan en la API sin necesidad de descargar la imagen después.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readImageSize(bytes, file.type);

  // El proveedor sale del tenant: cambiarlo en la base redirige las subidas
  // NUEVAS sin tocar las que ya están.
  const storage = createStorageAdapter(
    tenant?.storage_provider ?? "SUPABASE",
    tenant?.storage_bucket ?? "tenant-media",
    supabase,
  );
  const { bucket, path, sizeBytes } = await storage.put({
    tenantId,
    file,
    filename: file.name,
    contentType: file.type,
  });

  const { data: media, error } = await supabase
    .from("media")
    .insert({
      tenant_id: tenantId,
      // Se guarda DÓNDE quedó este archivo, no dónde subiría el tenant hoy.
      provider: storage.provider,
      bucket,
      path,
      mime_type: file.type,
      size_bytes: sizeBytes,
      width: size?.width ?? null,
      height: size?.height ?? null,
      alt_text: file.name.replace(/\.[^.]+$/, ""),
      uploaded_by: auth.user.id,
    })
    .select("id, width, height")
    .single();

  if (error) {
    // No dejamos huérfanos en el bucket si falla el registro en BD.
    await storage.remove(bucket, [path]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = await storage.signedUrl(bucket, path, 60 * 60 * 24 * 7);

  return NextResponse.json({
    id: media.id,
    url,
    width: media.width,
    height: media.height,
  });
}
