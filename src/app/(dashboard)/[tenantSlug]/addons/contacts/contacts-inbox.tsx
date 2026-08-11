"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Inbox, Archive, Trash2, Eye, X, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  formLabel,
  PROMOTED_PAYLOAD_KEYS,
  SUBMISSIONS_PER_PAGE,
  type SubmissionRow,
} from "@/lib/addons/contacts";

export type FormType = { key: string; total: number; unread: number };

export function ContactsInbox({
  basePath,
  submissions,
  formTypes,
  activeForm,
  isArchived,
  page,
  total,
  archiveAction,
  deleteAction,
  markReadAction,
}: {
  basePath: string;
  submissions: SubmissionRow[];
  formTypes: FormType[];
  activeForm: string | null;
  isArchived: boolean;
  page: number;
  total: number;
  archiveAction: (id: string, archived: boolean) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  markReadAction: (id: string) => Promise<void>;
}) {
  const [active, setActive] = useState<SubmissionRow | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const href = (next: { tab?: string | null; form?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const tab = next.tab === undefined ? (isArchived ? "archived" : null) : next.tab;
    const form = next.form === undefined ? activeForm : next.form;
    if (tab) params.set("tab", tab);
    if (form) params.set("form", form);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const open = (submission: SubmissionRow) => {
    setActive(submission);
    // Marcar leído es un efecto del acto de abrir, no una acción aparte: si
    // hubiera que pulsar un botón, la bandeja seguiría en verde para siempre.
    if (submission.status === "NEW") {
      startTransition(async () => {
        await markReadAction(submission.id);
      });
    }
  };

  const lastPage = Math.max(1, Math.ceil(total / SUBMISSIONS_PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 rounded-[var(--radius)] border bg-card p-1">
          <TabLink href={href({ tab: null, form: null, page: 1 })} isActive={!isArchived}>
            <Inbox className="size-4" />
            Bandeja
          </TabLink>
          <TabLink href={href({ tab: "archived", form: null, page: 1 })} isActive={isArchived}>
            <Archive className="size-4" />
            Archivados
          </TabLink>
        </nav>

        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "contacto" : "contactos"}
        </p>
      </div>

      {formTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipLink href={href({ form: null, page: 1 })} isActive={activeForm === null}>
            Todos
          </ChipLink>
          {formTypes.map((type) => (
            <ChipLink
              key={type.key}
              href={href({ form: type.key, page: 1 })}
              isActive={activeForm === type.key}
            >
              {formLabel(type.key)}
              <span className="ml-1.5 opacity-60">{type.total}</span>
              {type.unread > 0 && (
                <span
                  aria-label={`${type.unread} sin leer`}
                  className="ml-1 size-1.5 rounded-full bg-emerald-500"
                />
              )}
            </ChipLink>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius)] border bg-card">
        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <Inbox className="size-10 opacity-20" />
            <p className="text-sm">
              {isArchived
                ? "No hay contactos archivados."
                : "Todavía no ha llegado ningún contacto por tus formularios."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Correo</th>
                  <th className="px-4 py-3 font-semibold">Formulario</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {submissions.map((row) => (
                  /* La fila entera abre el detalle: en móvil las acciones
                     quedan al otro lado del scroll horizontal, y descubrirlo
                     es pedirle al usuario que adivine. */
                  <tr
                    key={row.id}
                    onClick={() => open(row)}
                    className="cursor-pointer align-middle hover:bg-accent/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">{row.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {formLabel(row.formKey)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {row.status === "NEW" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Nuevo
                        </span>
                      ) : (
                        "Leído"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label="Ver detalle" onClick={() => open(row)}>
                          <Eye className="size-4" />
                        </IconButton>
                        <IconButton
                          label={row.isArchived ? "Devolver a la bandeja" : "Archivar"}
                          onClick={() =>
                            startTransition(async () => {
                              await archiveAction(row.id, !row.isArchived);
                            })
                          }
                        >
                          {row.isArchived ? (
                            <Inbox className="size-4" />
                          ) : (
                            <Archive className="size-4" />
                          )}
                        </IconButton>
                        {row.isArchived && (
                          <IconButton
                            label="Eliminar definitivamente"
                            variant="destructive"
                            onClick={() => setToDelete(row.id)}
                          >
                            <Trash2 className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={href({ page: page - 1 })}>Anteriores</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= lastPage}>
              <Link href={href({ page: page + 1 })}>Siguientes</Link>
            </Button>
          </div>
        </div>
      )}

      {active && (
        <Drawer
          submission={active}
          isPending={pending}
          onClose={() => setActive(null)}
          onArchive={() => {
            startTransition(async () => {
              await archiveAction(active.id, !active.isArchived);
              setActive(null);
            });
          }}
          onDelete={() => {
            setToDelete(active.id);
            setActive(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={toDelete !== null}
        variant="destructive"
        title="¿Eliminar definitivamente?"
        description="El contacto desaparece de tu base de datos y no hay forma de recuperarlo."
        confirmText="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteAction(toDelete);
          setToDelete(null);
        }}
      />
    </div>
  );
}

function TabLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function ChipLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors ${
        isActive
          ? "border-transparent bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function IconButton({
  label,
  onClick,
  variant,
  children,
}: {
  label: string;
  onClick: () => void;
  variant?: "destructive";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Sin esto, archivar o borrar abriría además el detalle: el click sube
      // hasta la fila, que también es un disparador.
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-[var(--radius)] transition-colors ${
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Drawer({
  submission,
  isPending,
  onClose,
  onArchive,
  onDelete,
}: {
  submission: SubmissionRow;
  isPending: boolean;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  // Sólo lo que el formulario mandó de más: nombre, correo y mensaje ya
  // tienen su sitio en la ficha.
  const extras = Object.entries(submission.payload).filter(
    ([key]) => !PROMOTED_PAYLOAD_KEYS.has(key),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="absolute inset-0 bg-background/60 backdrop-blur-xs"
      />

      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l bg-card shadow-lg">
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formLabel(submission.formKey)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(submission.createdAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-[var(--radius)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <section>
            <h2 className="text-xl font-semibold">{submission.name ?? "Sin nombre"}</h2>
            {submission.email && (
              <a
                href={`mailto:${submission.email}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Mail className="size-3.5" />
                {submission.email}
              </a>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mensaje
            </h3>
            <p className="whitespace-pre-wrap rounded-[var(--radius)] border bg-background p-4 text-sm">
              {submission.message || "Este envío no traía mensaje."}
            </p>
          </section>

          {extras.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resto del formulario
              </h3>
              <dl className="divide-y rounded-[var(--radius)] border bg-background text-sm">
                {extras.map(([key, value]) => (
                  <div key={key} className="flex gap-3 p-3">
                    <dt className="w-1/3 shrink-0 text-muted-foreground">{key}</dt>
                    <dd className="min-w-0 flex-1 break-words">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {submission.sourceUrl && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Enviado desde
              </h3>
              <p className="break-all text-sm text-muted-foreground">{submission.sourceUrl}</p>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t p-4">
          {submission.isArchived && (
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onArchive} disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : submission.isArchived ? (
              <Inbox className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {submission.isArchived ? "Devolver a la bandeja" : "Archivar"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

/**
 * El payload es JSON libre: un campo puede llegar como lista (casillas
 * múltiples) o como objeto anidado. Se muestra siempre algo legible en vez de
 * un "[object Object]".
 */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => renderValue(v)).join(", ");
  return JSON.stringify(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
