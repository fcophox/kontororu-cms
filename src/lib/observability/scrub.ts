import type { Event } from "@sentry/nextjs";

/**
 * Qué NO sale de aquí hacia Sentry.
 *
 * Un servicio de errores es un sitio donde acaban cosas que nadie decidió
 * mandar: cabeceras completas, cookies de sesión, cuerpos de petición. En un
 * CMS multi-tenant eso es especialmente caro — una cookie de sesión en un
 * panel de errores es una sesión de administrador, y una API Key filtrada da
 * acceso a todo el contenido de un cliente.
 *
 * La postura es la contraria a la habitual: se envía lo mínimo que permite
 * diagnosticar —qué falló, dónde y de qué cliente— y todo lo demás se cae. Si
 * algún día falta contexto para depurar algo, se añade un campo concreto y a
 * conciencia; nunca se abre la puerta entera.
 *
 * `sendDefaultPii: false` en la configuración ya evita lo más evidente (IP y
 * correo), pero no basta: no toca las cabeceras ni el cuerpo, y no sabe nada
 * de nuestro formato de claves.
 */

/** Cabeceras que llevan credenciales. Se borran, no se recortan. */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  // Supabase manda la clave del proyecto en su propia cabecera.
  "apikey",
  "x-api-key",
  "x-supabase-auth",
]);

/**
 * Parámetros de query que nunca deben viajar.
 *
 * El resto se conserva —`locale`, `cursor`, `category` son justo lo que hace
 * falta para reproducir un fallo— porque una URL sin query no dice casi nada.
 */
const SENSITIVE_PARAMS = /^(token|key|apikey|api_key|secret|signature|sig|password|code)$/i;

const REDACTED = "[redactado]";

/**
 * Secretos incrustados en texto libre.
 *
 * Es la vía por la que se escapan de verdad: nadie manda una clave a
 * propósito, pero un mensaje de error la arrastra dentro de una URL firmada o
 * de un `fetch failed`. Estos tres patrones cubren lo que circula por aquí.
 */
const SECRET_PATTERNS: RegExp[] = [
  // API Keys de Kontorōru: kntr_live_<prefijo>.<secreto>
  /kntr_(live|test)_[A-Za-z0-9]+\.[A-Za-z0-9._-]+/g,
  // JWT: el service role de Supabase lo es, y bypassea RLS por completo.
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // `Bearer <lo que sea>` en un mensaje suelto.
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
];

/** Sustituye cualquier secreto reconocible dentro de un texto. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), text);
}

/** Limpia la query string conservando lo que sirve para reproducir el fallo. */
export function redactUrl(url: string): string {
  // Puede llegar relativa; la base ficticia sólo sirve para poder parsearla.
  let parsed: URL;
  try {
    parsed = new URL(url, "https://interno.invalid");
  } catch {
    return redactSecrets(url);
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_PARAMS.test(key)) parsed.searchParams.set(key, REDACTED);
  }

  const limpia = parsed.origin === "https://interno.invalid"
    ? `${parsed.pathname}${parsed.search}`
    : parsed.toString();

  return redactSecrets(limpia);
}

function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const limpias: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) continue;
    limpias[name] = redactSecrets(String(value));
  }

  return limpias;
}

/**
 * Última pasada antes de que un evento salga del servidor.
 *
 * Devolver `null` descartaría el evento; aquí siempre se envía, pero recortado.
 */
export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    const { request } = event;

    if (request.headers) request.headers = scrubHeaders(request.headers);

    // Las cookies son la sesión del panel. No hay ninguna versión de esto que
    // merezca la pena conservar.
    delete request.cookies;

    /*
     * El cuerpo se descarta entero.
     *
     * Es lo único que puede contener el contenido de un cliente —un artículo
     * sin publicar, los datos de un formulario, las variables de una consulta
     * GraphQL— y para diagnosticar basta con la ruta, el mensaje y el tenant.
     */
    delete request.data;

    if (request.query_string && typeof request.query_string === "string") {
      request.query_string = redactUrl(`?${request.query_string}`).replace(/^\?/, "");
    }

    if (request.url) request.url = redactUrl(request.url);
  }

  // Del usuario sólo interesa el id: con él se reproduce el caso, y no
  // identifica a nadie fuera de la base.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  if (event.message) event.message = redactSecrets(event.message);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value);
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = redactSecrets(crumb.message);
    if (typeof crumb.data?.url === "string") crumb.data.url = redactUrl(crumb.data.url);
  }

  return event;
}
