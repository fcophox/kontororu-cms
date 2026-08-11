import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantAddon } from "@/lib/addons/queries";
import { SUBMISSIONS_PER_PAGE, type SubmissionRow } from "@/lib/addons/contacts";
import { ContactsInbox } from "./contacts-inbox";
import { archiveSubmission, deleteSubmission, markSubmissionRead } from "./actions";

export const metadata = { title: "Contactos" };

type Search = { tab?: string; form?: string; page?: string };

export default async function ContactsAddonPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Search>;
}) {
  const { tenantSlug } = await params;
  const { tab, form, page } = await searchParams;
  const { tenant } = await requirePermission(tenantSlug, "addons.manage");

  const addon = await getTenantAddon(tenant.id, "contacts");
  if (!addon?.isEnabled) notFound();

  const isArchived = tab === "archived";
  // El formulario llega por la URL, así que se trata como entrada de fuera:
  // si no coincide con ninguna pestaña real, se ignora en vez de filtrar por
  // un valor inventado y enseñar una bandeja vacía sin explicación.
  const pageIndex = Math.max(0, Number(page) - 1 || 0);

  const supabase = await createServerClient();

  const { data: types } = await supabase.rpc("form_submission_types", {
    p_tenant: tenant.id,
    p_archived: isArchived,
  });

  const formTypes = (types ?? []).map((t) => ({
    key: t.form_key,
    total: Number(t.total),
    unread: Number(t.unread),
  }));

  const activeForm = form && formTypes.some((t) => t.key === form) ? form : null;

  let query = supabase
    .from("form_submissions")
    .select(
      "id, form_key, name, email, message, payload, status, is_archived, source_url, created_at",
      { count: "exact" },
    )
    .eq("tenant_id", tenant.id)
    .eq("is_archived", isArchived)
    .order("created_at", { ascending: false })
    .range(
      pageIndex * SUBMISSIONS_PER_PAGE,
      pageIndex * SUBMISSIONS_PER_PAGE + SUBMISSIONS_PER_PAGE - 1,
    );

  if (activeForm) query = query.eq("form_key", activeForm);

  const { data, count, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los contactos: ${error.message}`);

  const submissions: SubmissionRow[] = (data ?? []).map((row) => ({
    id: row.id,
    formKey: row.form_key,
    name: row.name,
    email: row.email,
    message: row.message,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status,
    isArchived: row.is_archived,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  }));

  const archive = async (id: string, archived: boolean) => {
    "use server";
    await archiveSubmission(tenantSlug, id, archived);
  };
  const remove = async (id: string) => {
    "use server";
    await deleteSubmission(tenantSlug, id);
  };
  const markRead = async (id: string) => {
    "use server";
    await markSubmissionRead(tenantSlug, id);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <Link
        href={`/${tenantSlug}/addons`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Complementos
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que llega por los formularios de tu web, separado por tipo. Archiva
          lo resuelto para que la bandeja sólo enseñe lo que sigue abierto.
        </p>
      </header>

      <ContactsInbox
        basePath={`/${tenantSlug}/addons/contacts`}
        submissions={submissions}
        formTypes={formTypes}
        activeForm={activeForm}
        isArchived={isArchived}
        page={pageIndex + 1}
        total={count ?? 0}
        archiveAction={archive}
        deleteAction={remove}
        markReadAction={markRead}
      />
    </div>
  );
}
