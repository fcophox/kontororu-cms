import { KontororuError, type KontororuErrorCode } from "./errors.js";
import type {
  Category,
  ListCategoriesOptions,
  ListMediaOptions,
  ListPostsOptions,
  MediaAsset,
  Paginated,
  Post,
  PostSummary,
  RateLimit,
} from "./types.js";

export type ClientOptions = {
  /** Base de tu instalación, con o sin `/api/v1`. */
  url: string;
  /** API Key del espacio. **Secreta**: sólo en servidor. */
  apiKey: string;
  /** Milisegundos antes de abortar. Por defecto 10 s. */
  timeoutMs?: number;
  /**
   * Reintentos ante 429 y errores de servidor. Por defecto 2.
   *
   * Respeta `Retry-After` cuando la API lo manda: reintentar antes de tiempo
   * sólo gasta cupo.
   */
  retries?: number;
  /**
   * Opciones de caché que se pasan tal cual a `fetch`.
   *
   * Existe para Next.js: `{ next: { tags: ["posts"] } }` permite que tu
   * endpoint de revalidación invalide justo lo que cambió. Sin esto habría
   * que envolver el cliente para poder etiquetar las peticiones.
   */
  fetchOptions?: RequestInit;
};

type RequestExtras = {
  /** Etiquetas de caché de Next para ESTA petición. */
  tags?: string[];
  revalidate?: number | false;
  signal?: AbortSignal;
};

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class KontororuClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchOptions: RequestInit;

  /** Cupo de la última respuesta. Útil para registrar cuánto queda. */
  lastRateLimit: RateLimit | null = null;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error("Falta la API Key de Kontorōru.");
    if (!options.url) throw new Error("Falta la URL de Kontorōru.");

    // Se acepta con y sin `/api/v1` para que copiar la URL del panel funcione.
    const trimmed = options.url.replace(/\/+$/, "");
    this.base = trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;

    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchOptions = options.fetchOptions ?? {};
  }

  // -------------------------------------------------------------------
  // Contenido
  // -------------------------------------------------------------------
  listPosts(options: ListPostsOptions = {}, extras?: RequestExtras) {
    return this.get<Paginated<PostSummary>>("/posts", options, {
      tags: ["posts"],
      ...extras,
    });
  }

  getPost(
    slug: string,
    options: { locale?: string; fallback?: "none" } = {},
    extras?: RequestExtras,
  ) {
    return this.get<{ data: Post }>(`/posts/${encodeURIComponent(slug)}`, options, {
      tags: ["posts", `post:${slug}`],
      ...extras,
    }).then((r) => r.data);
  }

  listCategories(options: ListCategoriesOptions = {}, extras?: RequestExtras) {
    return this.get<{ data: Category[] }>("/categories", options, {
      tags: ["categories"],
      ...extras,
    }).then((r) => r.data);
  }

  listMedia(options: ListMediaOptions = {}, extras?: RequestExtras) {
    return this.get<Paginated<MediaAsset>>("/media", options, { tags: ["media"], ...extras });
  }

  getMedia(id: string, extras?: RequestExtras) {
    return this.get<{ data: MediaAsset & { expiresIn: number } }>(
      `/media/${encodeURIComponent(id)}`,
      {},
      { tags: ["media", `media:${id}`], ...extras },
    ).then((r) => r.data);
  }

  /**
   * Recorre TODAS las páginas.
   *
   * Un generador y no un array porque un espacio con miles de entradas no
   * cabe cómodamente en memoria, y porque generar un sitemap o un índice de
   * búsqueda quiere procesar según llega, no esperar al final.
   */
  async *iteratePosts(
    options: Omit<ListPostsOptions, "cursor"> = {},
  ): AsyncGenerator<PostSummary, void, undefined> {
    let cursor: string | undefined;

    do {
      const page = await this.listPosts({ ...options, cursor });
      for (const post of page.data) yield post;
      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);
  }

  // -------------------------------------------------------------------
  // Transporte
  // -------------------------------------------------------------------
  private async get<T>(
    path: string,
    params: Record<string, unknown>,
    extras: RequestExtras = {},
  ): Promise<T> {
    const url = new URL(this.base + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    let lastError: KontororuError | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.attempt<T>(url, extras);
      } catch (error) {
        if (!(error instanceof KontororuError) || !error.isRetryable) throw error;

        lastError = error;
        if (attempt === this.retries) break;

        // `Retry-After` manda sobre el backoff propio: la API sabe mejor
        // cuándo se reabre el cupo.
        const wait = error.retryAfter ? error.retryAfter * 1000 : 2 ** attempt * 500;
        await SLEEP(wait);
      }
    }

    throw lastError;
  }

  private async attempt<T>(url: URL, extras: RequestExtras): Promise<T> {
    // Timeout propio combinado con el signal del llamante: sin esto, una
    // petición colgada bloquea el build entero sin decir por qué.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    extras.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    let response: Response;
    try {
      response = await fetch(url, {
        ...this.fetchOptions,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...this.fetchOptions.headers,
        },
        signal: controller.signal,
        ...(extras.tags || extras.revalidate !== undefined
          ? { next: { tags: extras.tags, revalidate: extras.revalidate } }
          : {}),
      } as RequestInit);
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new KontororuError(
        "network_error",
        aborted ? `Kontorōru no respondió en ${this.timeoutMs} ms.` : "No se pudo contactar con Kontorōru.",
        0,
      );
    } finally {
      clearTimeout(timer);
    }

    this.readRateLimit(response);

    if (!response.ok) throw await this.toError(response);

    return (await response.json()) as T;
  }

  private readRateLimit(response: Response): void {
    const limit = Number(response.headers.get("x-ratelimit-limit"));
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));
    const reset = Number(response.headers.get("x-ratelimit-reset"));

    if (Number.isFinite(limit) && Number.isFinite(remaining) && Number.isFinite(reset)) {
      this.lastRateLimit = { limit, remaining, resetAt: new Date(reset * 1000) };
    }
  }

  private async toError(response: Response): Promise<KontororuError> {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;

    let code: KontororuErrorCode = "server_error";
    let message = `Kontorōru respondió ${response.status}.`;

    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code as KontororuErrorCode;
      if (body.error?.message) message = body.error.message;
    } catch {
      // Una respuesta que no es JSON —un 502 del proxy, por ejemplo— sigue
      // siendo un error válido: se conserva el status y se sigue.
    }

    return new KontororuError(code, message, response.status, retryAfter);
  }
}

/** Atajo para el caso normal: un cliente por proceso. */
export function createClient(options: ClientOptions): KontororuClient {
  return new KontororuClient(options);
}
