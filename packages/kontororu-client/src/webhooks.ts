import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificación de webhooks.
 *
 * Vive en el SDK, y no sólo en la documentación, porque copiar y pegar código
 * criptográfico es donde se cuelan los errores que no se notan: comparar
 * firmas con `===` abre un canal temporal, olvidar el timestamp deja pasar
 * reenvíos, y `JSON.parse` antes de verificar hace que el HMAC se calcule
 * sobre un cuerpo distinto del recibido.
 *
 * Aquí las tres cosas están resueltas y no hay forma de configurarlas mal.
 */

export type WebhookEvent =
  | "post.created"
  | "post.published"
  | "post.updated"
  | "post.unpublished"
  | "post.deleted"
  | "category.updated"
  | "media.deleted";

export type WebhookPayload = {
  event: WebhookEvent;
  tenantId: string;
  occurredAt: string;
  data: {
    id: string;
    slug: string;
    title: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    categoryId: string | null;
    locale: string;
    /** Presente sólo cuando la URL ha cambiado: invalida también la antigua. */
    previousSlug?: string;
    /** Hermanas publicadas, `idioma -> slug`: su selector apunta a esta página. */
    translations: Record<string, string>;
  };
};

export class WebhookVerificationError extends Error {
  readonly reason: "missing-headers" | "stale" | "bad-signature" | "malformed";

  constructor(reason: WebhookVerificationError["reason"], message: string) {
    super(message);
    this.name = "WebhookVerificationError";
    this.reason = reason;
  }
}

/** Ventana de tolerancia frente al reloj y la latencia de entrega. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verifica la firma y devuelve el payload ya tipado.
 *
 * **Pásale el cuerpo en crudo** (`await request.text()`), no un objeto ya
 * parseado: el HMAC se calcula sobre los bytes exactos que enviamos, y
 * `JSON.parse` seguido de `JSON.stringify` puede reordenar claves o cambiar
 * el escapado, con lo que la firma dejaría de cuadrar aunque todo sea
 * legítimo.
 */
export function verifyWebhook(options: {
  /** Cuerpo tal cual llegó, sin parsear. */
  body: string;
  /** Cabeceras de la petición. Acepta `Headers` o un objeto plano. */
  headers: Headers | Record<string, string | string[] | undefined>;
  /** Secreto del webhook, visible en Ajustes → Webhooks. */
  secret: string;
  toleranceSeconds?: number;
}): WebhookPayload {
  const { body, secret, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS } = options;

  const timestamp = readHeader(options.headers, "x-kontororu-timestamp");
  const signature = readHeader(options.headers, "x-kontororu-signature");

  if (!timestamp || !signature) {
    throw new WebhookVerificationError(
      "missing-headers",
      "Faltan las cabeceras de firma de Kontorōru.",
    );
  }

  // El timestamp se comprueba ANTES que la firma: un reenvío capturado lleva
  // una firma perfectamente válida, y lo único que lo delata es su edad.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    throw new WebhookVerificationError(
      "stale",
      `La entrega tiene ${Math.round(age)} s: fuera de la ventana de ${toleranceSeconds} s.`,
    );
  }

  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

  if (!safeEqual(signature, expected)) {
    throw new WebhookVerificationError("bad-signature", "La firma no es válida.");
  }

  try {
    return JSON.parse(body) as WebhookPayload;
  } catch {
    throw new WebhookVerificationError("malformed", "El cuerpo no es JSON válido.");
  }
}

/**
 * Todas las rutas que hay que invalidar por esta entrega.
 *
 * Incluye la anterior cuando el slug cambió y las de las traducciones: su
 * selector de idioma apunta a la página que acaba de moverse, así que
 * quedarían enlazando a una URL que ya no existe.
 */
export function affectedTags(payload: WebhookPayload): string[] {
  const tags = new Set<string>(["posts", `post:${payload.data.slug}`]);

  if (payload.data.previousSlug) tags.add(`post:${payload.data.previousSlug}`);
  for (const slug of Object.values(payload.data.translations ?? {})) {
    tags.add(`post:${slug}`);
  }

  return [...tags];
}

function readHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Comparación en tiempo constante.
 *
 * `a === b` corta en el primer byte distinto, y esa diferencia de tiempo
 * basta para reconstruir una firma válida byte a byte. `timingSafeEqual`
 * exige longitudes iguales, así que se comprueba antes — y esa comprobación
 * sí puede ser rápida: la longitud no es secreta.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
