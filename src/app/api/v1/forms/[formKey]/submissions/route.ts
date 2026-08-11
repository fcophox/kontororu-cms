import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/authenticate";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/response";
import { FORM_KEY_RE, SubmissionInput } from "@/lib/addons/contacts";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/forms/{formKey}/submissions
 *
 * Entrada de los formularios de la web del cliente. Requiere una API Key con
 * el permiso `forms:write`, así que el envío lo hace el servidor de la web,
 * no el navegador: una clave en el bundle la usaría cualquiera para llenar
 * la bandeja de basura.
 *
 * El formulario NO hay que declararlo antes: el primer envío da de alta el
 * tipo y la bandeja lo muestra como una pestaña más.
 */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ formKey: string }> },
) {
  const guard = await guardApiRequest(req, "forms:write");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { formKey } = await params;
  if (!FORM_KEY_RE.test(formKey)) {
    return apiError(
      "bad_request",
      "El identificador del formulario admite minúsculas, números, guion y guion bajo (2-40 caracteres).",
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "El cuerpo debe ser JSON.");
  }

  const parsed = SubmissionInput.safeParse(body);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return apiError(
      "bad_request",
      Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? "Datos no válidos",
    );
  }

  const input = parsed.data;

  const db = createServiceClient();

  // El complemento se comprueba en cada envío, no sólo al configurar: si el
  // cliente lo desactiva, su web deja de poder escribir en la bandeja en
  // lugar de seguir acumulando filas que nadie va a leer.
  const { data: addon } = await db
    .from("tenant_addons")
    .select("is_enabled")
    .eq("tenant_id", ctx.tenantId)
    .eq("addon_key", "contacts")
    .maybeSingle();

  if (!addon?.is_enabled) {
    return apiError("not_found", "El complemento Contactos no está activo.");
  }

  const { data, error } = await db
    .from("form_submissions")
    .insert({
      tenant_id: ctx.tenantId,
      form_key: formKey,
      name: input.name ?? null,
      email: input.email ?? null,
      message: input.message ?? null,
      source_url: input.sourceUrl ?? null,
      // El envío íntegro, incluidos los campos que ya tienen columna: la
      // columna existe para poder listar, no para sustituir al original.
      payload: { ...input.payload, ...stripUndefined(input) },
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("POST /api/v1/forms/[formKey]/submissions", error);
    return apiError("server_error", "No se pudo registrar el envío.");
  }

  return NextResponse.json(
    { data: { id: data.id, formKey, createdAt: data.created_at } },
    { status: 201, headers: { ...guard.headers, "Cache-Control": "no-store" } },
  );
}

/** Los campos promovidos a columna, sin los ausentes ni el payload anidado. */
function stripUndefined(input: {
  name?: string;
  email?: string;
  message?: string;
  sourceUrl?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.name) out.name = input.name;
  if (input.email) out.email = input.email;
  if (input.message) out.message = input.message;
  if (input.sourceUrl) out.sourceUrl = input.sourceUrl;
  return out;
}
