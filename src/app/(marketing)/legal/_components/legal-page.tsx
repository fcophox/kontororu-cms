import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  LEGAL_DOCS,
  LEGAL_SLUGS,
  LEGAL_UPDATED,
  type LegalBlock,
  type LegalSlug,
} from "../_data/legal";

const URL_RE = /(https?:\/\/[^\s,]+[^\s,.])/g;

/** Convierte las URLs sueltas del texto en enlaces. */
function Text({ children }: { children: string }) {
  return children.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-foreground underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return (
      <p className="leading-relaxed text-muted-foreground text-pretty">
        <Text>{block}</Text>
      </p>
    );
  }

  if ("list" in block) {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-muted-foreground marker:text-border">
        {block.list.map((item) => (
          <li key={item}>
            <Text>{item}</Text>
          </li>
        ))}
      </ul>
    );
  }

  // La tabla desborda por los lados en móvil en vez de aplastar cuatro
  // columnas en 340px: se lee deslizando, no descifrando.
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr>
            {block.table.head.map((h) => (
              <th
                key={h}
                className="border-b py-2 pr-4 text-left align-bottom font-medium text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row) => (
            <tr key={row[0]} className="border-b border-border/50 last:border-0">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={`py-3 pr-4 align-top leading-relaxed ${
                    i === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = LEGAL_DOCS[slug];
  const others = LEGAL_SLUGS.filter((s) => s !== slug);

  const updated = new Date(`${LEGAL_UPDATED}T00:00:00`).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-svh">
      {/* Cabecera mínima y no la SiteHeader de la portada: su menú son anclas
          (#producto, #clientes…) que desde aquí no llevarían a ningún sitio. */}
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-6 px-6">
          <Link
            href="/"
            className="flex items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Image
              src="/brand/kontororu-logotipo.svg"
              alt="Kontorōru"
              width={2677}
              height={733}
              unoptimized
              priority
              className="h-8 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-14 pb-24">
        <header className="mb-14">
          <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">Última actualización: {updated}</p>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty">
            {doc.intro}
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {doc.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </div>

        <nav className="mt-20 flex flex-wrap gap-x-6 gap-y-2 border-t pt-8 text-sm">
          {others.map((s) => (
            <Link
              key={s}
              href={`/legal/${s}`}
              className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {LEGAL_DOCS[s].title}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
