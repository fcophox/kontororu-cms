export type KontororuErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "server_error"
  | "network_error";

/**
 * Error de la API con el código intacto.
 *
 * El motivo de exponer `code` y no sólo un mensaje es que cada uno se trata
 * distinto y de forma automatizable: un `not_found` en una página de artículo
 * es un 404 legítimo del sitio, un `unauthorized` es una clave mal
 * configurada que hay que arreglar, y un `rate_limited` se reintenta.
 * Distinguirlos parseando el mensaje sería frágil y además rompería el día
 * que se traduzcan.
 */
export class KontororuError extends Error {
  readonly code: KontororuErrorCode;
  readonly status: number;
  /** Segundos que pide esperar la API. Sólo en `rate_limited`. */
  readonly retryAfter?: number;

  constructor(
    code: KontororuErrorCode,
    message: string,
    status: number,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "KontororuError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** `true` si reintentar tiene sentido: límite de cupo o fallo del servidor. */
  get isRetryable(): boolean {
    return this.code === "rate_limited" || this.code === "server_error" || this.code === "network_error";
  }

  /**
   * `true` cuando el contenido simplemente no existe.
   *
   * Es el caso que una web quiere convertir en su propio 404 en vez de
   * romper el build, así que se distingue con un getter en lugar de obligar
   * a comparar strings.
   */
  get isNotFound(): boolean {
    return this.code === "not_found";
  }
}
