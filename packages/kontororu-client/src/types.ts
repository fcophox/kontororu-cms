/**
 * Formas públicas de la API de Kontorōru.
 *
 * Se escriben a mano en vez de generarse desde el esquema de Postgres, y es
 * deliberado: lo que la API devuelve es un CONTRATO, no un reflejo de las
 * tablas. Generarlos ataría el paquete a decisiones internas —renombrar una
 * columna rompería a los clientes— y expondría campos que nunca salen.
 */

export type Locale = string;

export type Media = {
  id: string;
  /** Firmada, con 24 h de validez. No la guardes: vuelve a pedirla. */
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type MediaAsset = Media & {
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  kind: "BLOG" | "CASE_STUDY" | "SERVICE" | "CUSTOM";
  description?: string | null;
  locale?: Locale;
  parentId?: string | null;
  /** Sólo entradas publicadas: sirve para no enlazar categorías vacías. */
  postCount?: number;
};

export type Tag = { id: string; slug: string; name: string };

export type Seo = {
  title?: string;
  description?: string;
  ogImage?: string;
};

export type PostSummary = {
  id: string;
  slug: string;
  locale: Locale;
  /** Otras versiones de este contenido: `idioma -> slug`. Sólo publicadas. */
  translations: Record<Locale, string>;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingTime: number | null;
  seo: Seo;
  customFields: Record<string, unknown>;
  category: Category | null;
  cover: Media | null;
  tags: Tag[];
};

export type Post = PostSummary & {
  content: {
    /** Saneado en el servidor con allowlist de etiquetas y atributos. */
    html: string;
    /** Documento estructurado, si prefieres renderizar tus componentes. */
    json: unknown;
  };
};

export type Pagination = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type Paginated<T> = {
  data: T[];
  pagination: Pagination;
};

export type ListPostsOptions = {
  limit?: number;
  cursor?: string;
  locale?: Locale;
  category?: string;
  tag?: string;
  /** Busca en el título. */
  q?: string;
  /**
   * `"none"` desactiva el respaldo al idioma principal.
   *
   * Por defecto, un contenido que no está traducido llega en el idioma que sí
   * exista —su campo `locale` lo dice— en vez de faltar. Con `"none"`
   * simplemente no aparece.
   */
  fallback?: "none";
};

export type ListCategoriesOptions = {
  locale?: Locale;
  kind?: Category["kind"];
  /** `"none"` cuenta sólo lo traducido a `locale`. Ver `ListPostsOptions`. */
  fallback?: "none";
};

export type ListMediaOptions = {
  limit?: number;
  cursor?: string;
  type?: "image" | "video" | "document";
};

/** Cupo restante, tal y como lo anuncia cada respuesta. */
export type RateLimit = {
  limit: number;
  remaining: number;
  resetAt: Date;
};
