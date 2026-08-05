/**
 * Validación de destinos para peticiones salientes (webhooks).
 *
 * Vive en su propio módulo, fuera del `"use server"`, por dos razones: se
 * puede testear sin levantar nada, y cuando aparezca un segundo consumidor
 * (importar contenido desde una URL, previsualizar un OG) no habrá dos
 * listas divergiendo.
 *
 * El riesgo concreto: el webhook lo emite NUESTRO servidor, así que una URL
 * apuntando a la red interna convierte el CMS en un proxy hacia servicios
 * que no deberían ser alcanzables desde fuera — sobre todo el endpoint de
 * metadatos del proveedor cloud (169.254.169.254), que devuelve credenciales.
 */

const BLOCKED_HOSTNAMES: RegExp[] = [
  /^localhost$/i,
  /^127\./, // loopback
  /^0\.0\.0\.0$/,
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^169\.254\./, // link-local: metadatos de AWS, GCP y Azure
  /^\[?::1\]?$/, // loopback IPv6
  /^\[?fe80:/i, // link-local IPv6
  /^\[?fc00:/i, // ULA IPv6
  /^\[?fd[0-9a-f]{2}:/i, // ULA IPv6
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
];

export type UrlRejection =
  | "invalid"
  | "scheme"
  | "private-host"
  | "credentials"
  | null;

/**
 * Devuelve el motivo del rechazo, o `null` si el destino es aceptable.
 * Se devuelve la causa en vez de un booleano para poder dar un mensaje
 * concreto: "usa HTTPS" y "ese host no está permitido" se arreglan distinto.
 */
export function rejectOutboundUrl(raw: string): UrlRejection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }

  if (url.protocol !== "https:") return "scheme";

  // Un `https://user:pass@host` filtraría credenciales en cada entrega y
  // además permite ofuscar el host real ante una revisión visual.
  if (url.username || url.password) return "credentials";

  if (BLOCKED_HOSTNAMES.some((re) => re.test(url.hostname))) return "private-host";

  return null;
}

export const REJECTION_MESSAGES: Record<NonNullable<UrlRejection>, string> = {
  invalid: "La URL no es válida.",
  scheme: "El endpoint debe usar HTTPS.",
  credentials: "No incluyas usuario ni contraseña en la URL.",
  "private-host": "Ese destino no está permitido: usa un dominio público.",
};
