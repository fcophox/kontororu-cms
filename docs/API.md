# API de Kontorōru

Referencia para conectar una web a tu contenido. Escrita para quien monta el
front-end, no para quien mantiene el CMS.

**Base:** `https://tu-instalacion.kontororu.app/api/v1`

---

## Autenticación

Cada petición lleva tu API Key como Bearer token:

```
Authorization: Bearer kntr_live_ab12cd34ef56.<secreto>
```

La clave se crea en **Ajustes → API Keys** y se muestra **una sola vez**:
guardamos un hash, así que no podemos volver a enseñártela. Si la pierdes,
revócala y crea otra.

> **El espacio se deduce de la clave.** No hay ningún parámetro para indicar
> de qué cliente quieres el contenido, y añadirlo no cambia nada: una clave
> sólo puede leer su propio espacio. Por eso dos clientes pueden tener ambos
> un artículo `/sobre-nosotros` sin pisarse.

La clave es **secreta**: úsala desde el servidor (Server Component, Route
Handler, `getStaticProps`), nunca desde el navegador.

La única excepción es `/reactions`, que no lleva clave porque lo llama el
navegador de quien lee. Está explicado en su propia sección.

---

## `GET /posts`

Listado de contenido publicado, del más reciente al más antiguo.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `limit` | 1–100 | Elementos por página (20 por defecto) |
| `cursor` | ISO 8601 | `pagination.nextCursor` de la respuesta anterior |
| `locale` | código | Idioma; por defecto, el principal del espacio |
| `category` | slug | Filtra por categoría |
| `tag` | slug | Filtra por etiqueta |
| `q` | texto | Busca en el título |

```json
{
  "data": [
    {
      "id": "9f8c…",
      "slug": "rediseno-plataforma-fintech",
      "title": "Rediseño de una plataforma fintech",
      "excerpt": "Cómo redujimos el alta de 12 a 3 minutos.",
      "publishedAt": "2026-08-03T09:12:00.000Z",
      "updatedAt": "2026-08-04T11:02:00.000Z",
      "readingTime": 4,
      "seo": { "title": "…", "description": "…" },
      "customFields": { "cliente": "Fintech S.A.", "duracion": "4 meses" },
      "category": { "id": "…", "slug": "casos-de-estudio", "name": "Casos de Estudio", "kind": "CASE_STUDY" },
      "cover": { "id": "…", "url": "https://…", "alt": "Portada", "width": 1200, "height": 630 },
      "tags": [{ "id": "…", "slug": "ux", "name": "UX" }]
    }
  ],
  "pagination": { "hasMore": true, "nextCursor": "2026-08-01T10:00:00.000Z" }
}
```

**El listado no incluye el cuerpo del contenido.** Para eso está el detalle:
devolver el HTML de 100 entradas multiplica el peso de la respuesta y nadie lo
usa para pintar una portada.

La paginación es por cursor, no por número de página: si se publica algo
mientras paginas, no se te duplica ni se te salta ninguna entrada.

## `GET /posts/{slug}`

Igual que un elemento del listado, más el cuerpo:

```json
{
  "data": {
    "slug": "rediseno-plataforma-fintech",
    "content": {
      "html": "<p>El reto era claro…</p>",
      "json": { "type": "doc", "content": [] }
    }
  }
}
```

- **`content.html`** — ya saneado en el servidor, listo para inyectar.
- **`content.json`** — el documento estructurado, si prefieres recorrerlo y
  renderizar tus propios componentes.

Un borrador devuelve **404**, igual que un slug inexistente: que exista un
borrador con ese nombre no es información pública.

## `GET /categories`

```json
{
  "data": [
    {
      "id": "…", "slug": "casos-de-estudio", "name": "Casos de Estudio",
      "kind": "CASE_STUDY", "description": null, "parentId": null, "postCount": 12
    }
  ]
}
```

Filtra con `?kind=BLOG|CASE_STUDY|SERVICE|CUSTOM`. `postCount` cuenta sólo
entradas publicadas — sirve para no enlazar categorías vacías en tu menú.

## `GET /media`

La biblioteca de archivos del espacio. Requiere el permiso **`media:read`**,
separado de `content:read`: una clave que sólo alimenta un blog no tiene por
qué poder enumerar todo lo subido, incluido lo que aún no se ha publicado.

```json
{
  "data": [
    {
      "id": "…", "url": "https://…", "alt": "Portada",
      "mimeType": "image/webp", "sizeBytes": 51200,
      "width": 1200, "height": 630, "createdAt": "2026-08-03T09:12:00.000Z"
    }
  ],
  "pagination": { "hasMore": false, "nextCursor": null }
}
```

Filtra con `?type=image|video|document`. Paginación por cursor, igual que en
`/posts`.

## `GET /reactions` y `POST /reactions`

> **Este endpoint NO lleva clave**, y es el único. Lo llama el navegador de
> quien lee el artículo para pulsar el gesto de "me gusta", así que una clave
> viviría dentro del bundle de la web y la vería cualquiera. Como el espacio no
> se puede deducir de una clave que no existe, aquí sí viaja en la petición
> (`tenant`), y es el slug público del espacio, no un secreto.
>
> Requiere el complemento **Reacciones** activo en el espacio. Sin él, el
> `POST` devuelve 404.

Leer los contadores:

```
GET /api/v1/reactions?tenant=mi-espacio&slug=mi-articulo
```

```json
{ "data": { "slug": "mi-articulo", "totals": { "like": 12, "clap": 31 } } }
```

Sumar una:

```
POST /api/v1/reactions
{ "tenant": "mi-espacio", "slug": "mi-articulo", "reaction": "like" }
```

```json
{ "data": { "slug": "mi-articulo", "reaction": "like", "total": 13 } }
```

Devuelve el total ya incrementado: no hace falta un segundo `GET`.

`reaction` es opcional (por defecto `like`) y admite `^[a-z][a-z0-9_-]{1,39}$`.
El gesto no se declara en ninguna parte — el primer clic lo da de alta, igual
que los formularios del complemento Contactos.

**El contador es del contenido, no de la traducción.** Todas las versiones de
idioma de un artículo suman al mismo número: quien pulse en la inglesa y quien
pulse en la española están aplaudiendo lo mismo.

**Un contenido sin reacciones devuelve `{}` con un 200**, igual que un slug
inexistente. No uses este endpoint para saber si un artículo existe.

**El cupo aquí es por IP, 60/min**, no por clave — no hay clave. Por eso el
`POST` debe salir del navegador de cada lector y no de tu servidor: proxiándolo,
toda tu web comparte una sola IP y agota el cupo entre todos. El `GET` sí puede
ir por servidor.

No existe forma de retirar una reacción: el contador sólo sube. Ponerlo a cero
se hace desde el panel, en **Complementos → Reacciones**.

---

## `GET /addons/calendar/availability`

> Requiere el complemento **Calendario** activo en el espacio. Sin él, `404`.

La disponibilidad semanal que el cliente ha configurado en **Complementos →
Calendario**, para que el formulario de agenda de tu web sólo ofrezca tramos
que existen. Scope `content:read`.

Se devuelve la **semana**, no fechas concretas: la configuración es un patrón
semanal. Tú ya sabes qué día de la semana cae cada fecha.

```json
{
  "data": {
    "timezone": "America/Santiago",
    "startTime": "09:00",
    "endTime": "18:00",
    "slotMinutes": 30,
    "slots": [{ "start": "09:00", "end": "09:30" }],
    "week": [
      {
        "weekday": 1,
        "label": "Lunes",
        "isClosed": false,
        "available": [{ "start": "10:00", "end": "10:30" }]
      }
    ]
  }
}
```

`slots` es la rejilla completa del día antes de aplicar bloqueos; `available`
es lo que de verdad se ofrece ese día. **Usa `available`** — `slots` sólo
sirve si quieres pintar en gris los tramos cerrados.

`weekday` usa el mismo índice que `Date#getDay()`: 0 = domingo, 6 = sábado.

⚠️ **Si cacheas esta respuesta, suscríbete al evento `addon.updated`** (ver
*Webhooks*) y revalida con él. Sin esa suscripción, no la caches más de lo que
dice su cabecera: tu web seguiría ofreciendo horas que el cliente ya cerró.

---

## `GET /media/{id}`

El mismo objeto, con firma recién generada y `expiresIn` en segundos. Sirve
para **renovar la URL de una imagen que cacheaste**: las firmas caducan, los
ids no.

---

## Idiomas

Cada idioma es un **contenido completo**: su propia URL, su SEO y su estado de
publicación. La traducción al inglés puede estar en borrador mientras la
española lleva meses publicada.

**Sin `?locale=` recibes el idioma principal del espacio**, nunca todos
mezclados: si mañana tu cliente activa un segundo idioma, tu listado no
empieza a mostrar cada artículo por duplicado.

Pedir un idioma no activado devuelve **400**, no una lista vacía — un 200 con
cero resultados se confunde con "aún no hay contenido".

Cada elemento trae sus hermanas:

```json
{
  "slug": "rediseno-plataforma-fintech",
  "locale": "es",
  "translations": { "en": "fintech-platform-redesign" }
}
```

Con eso montas el selector de idioma y las etiquetas `hreflang` sin una
petición por traducción:

```tsx
<link rel="alternate" hrefLang="es" href={`/es/${post.slug}`} />
{Object.entries(post.translations).map(([locale, slug]) => (
  <link key={locale} rel="alternate" hrefLang={locale} href={`/${locale}/${slug}`} />
))}
```

Sólo aparecen traducciones **publicadas**: enlazar a un borrador daría un 404
a tus visitantes y a los buscadores.

Los webhooks también incluyen `locale` y `translations`, para que puedas
revalidar las páginas hermanas — su selector de idioma apunta a la que cambió.

---

## Imágenes

`cover.url` y las URLs de `/media` son **firmadas, con 24 h de validez**, no
rutas permanentes. Pídelas en cada build o cada revalidación; no las guardes
en tu base de datos.

Vienen `width` y `height` para que puedas reservar el hueco y evitar saltos de
maquetación (CLS).

### Imágenes dentro del contenido

Las que van en `content.html` y `content.json` **se vuelven a firmar cada vez
que pides el detalle**, así que no caducan por mucho que tarde tu build.

Si guardas el HTML en tu propia base de datos, esas URLs sí envejecerán:
vuelve a pedir el detalle en cada revalidación, o quédate con `content.json`
y resuelve las imágenes por su `mediaId` con `/media/{id}`.

```json
{ "type": "image", "attrs": { "src": "https://…", "mediaId": "9f8c…", "alt": "Foto" } }
```

## Errores

Siempre la misma forma:

```json
{ "error": { "code": "not_found", "message": "No hay contenido publicado en \"x\"." } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `unauthorized` | 401 | Falta la clave, es inválida o está revocada |
| `forbidden` | 403 | La clave no tiene el permiso necesario |
| `not_found` | 404 | No hay contenido publicado con ese slug |
| `bad_request` | 400 | Un parámetro no es válido |
| `server_error` | 500 | Fallo nuestro |

## Caché

**Contenido** (`/posts`, `/categories`, `/media`) —
`Cache-Control: public, s-maxage=60, stale-while-revalidate=600`. Puedes
cachear con tranquilidad: el webhook te avisa en cuanto cambia algo, así que
la ventana sólo cubre el hueco entre la publicación y el aviso.

**Configuración de complementos** (`/addons/calendar/availability`) —
`Cache-Control: public, s-maxage=30, must-revalidate`. Ventana más corta y sin
servir obsoleto, porque aquí **no hay webhook que avise**: los eventos se
emiten sobre el contenido, no sobre la configuración. Si la cacheas por tu
cuenta más allá de esos 30 s, un horario que el cliente acaba de corregir
seguirá apareciendo mal en tu web y no habrá nada que lo despierte.

Si te suscribes al evento `addon.updated` (ver *Webhooks*) puedes cachear esa
respuesta todo lo que quieras y revalidar cuando te avisemos, que es lo que
recomendamos. Sin suscripción, respeta la cabecera y no fijes un `revalidate`
propio más largo.

## Límite de peticiones

| Plan | Peticiones por minuto |
|---|---|
| Free | 60 |
| Pro | 600 |
| Enterprise | 6000 |

Cada respuesta lleva tu situación actual:

```
X-RateLimit-Limit:     600
X-RateLimit-Remaining: 597
X-RateLimit-Reset:     1785855960   (epoch en segundos)
```

Al superarlo recibes **429** con `Retry-After` en segundos:

```json
{ "error": { "code": "rate_limited", "message": "Has superado el límite de 600 peticiones por minuto. Reintenta en 19 s." } }
```

El cupo es **por clave**, no por IP: varias webs tuyas detrás del mismo proxy
no se restan cupo entre ellas, y otra que use una clave distinta tampoco te
afecta.

En la práctica cuesta llegar: si cacheas las respuestas —o usas ISR, que es lo
normal— una reconstrucción entera son unas pocas peticiones. Tocar el techo
suele significar un bucle en el código, no tráfico real.

---

## Webhooks: mantener la web al día

Configura en **Ajustes → Webhooks** un endpoint de tu web. Te llamamos al
publicar, actualizar o despublicar contenido, y al cambiar la configuración de
un complemento.

### `addon.updated`

Se emite cuando el cliente activa, apaga o reconfigura un complemento — por
ejemplo, al cambiar su disponibilidad en **Complementos → Calendario**.

```json
{
  "event": "addon.updated",
  "tenantId": "…",
  "occurredAt": "2026-08-18T19:28:43Z",
  "data": { "addon": "calendar", "isEnabled": true }
}
```

El payload **no trae la configuración**, igual que el de contenido no trae el
cuerpo del artículo: es un aviso de "esto cambió, vuelve a pedirlo". Revalida
la etiqueta con la que cacheaste `/addons/calendar/availability` y vuelve a
leer el endpoint.

`isEnabled: false` significa que el complemento ya no responde: su endpoint
devuelve `404` y conviene que retires de tu web la sección que lo usa, en vez
de dejarla pidiendo algo que ya no existe.

Suscribirse es opcional. Si no lo haces, los cambios siguen llegando por la
caché corta del endpoint (30 s); con el evento llegan en el acto.

> **Si tu webhook ya existía**, lo suscribimos nosotros al desplegar este
> evento: no tienes que tocar nada, pero **empezarás a recibir entregas con
> `event: "addon.updated"`**. Comparten forma y firma con las demás, así que
> un receptor que mire `event` antes de actuar las ignora sin más. Si el tuyo
> revalida a ciegas, hará alguna revalidación de sobra — y si prefieres no
> recibirlas, desmarca el evento en **Ajustes → Webhooks**.

Cabeceras de cada entrega:

```
X-Kontororu-Event:     post.published
X-Kontororu-Timestamp: 1785312000
X-Kontororu-Signature: sha256=<hmac(secreto, "timestamp.cuerpo")>
```

**Verifica siempre la firma**: sin ella, cualquiera que conozca tu endpoint
puede forzarte reconstrucciones.

```ts
// app/api/revalidate/route.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  const body = await req.text();
  const ts = req.headers.get("x-kontororu-timestamp")!;
  const sig = req.headers.get("x-kontororu-signature")!;

  // El timestamp entra en el HMAC para poder rechazar reenvíos.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return new Response("stale", { status: 401 });
  }

  const expected = `sha256=${createHmac("sha256", process.env.KONTORORU_WEBHOOK_SECRET!)
    .update(`${ts}.${body}`)
    .digest("hex")}`;

  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return new Response("bad signature", { status: 401 });
  }

  const { data } = JSON.parse(body);
  revalidateTag(`post:${data.slug}`);
  revalidateTag("posts");
  return Response.json({ revalidated: true });
}
```

La entrega sale **en el momento de publicar**, no en un turno periódico: entre
que el editor pulsa Publicar y tu endpoint recibe el POST pasan segundos.

Si tu endpoint falla, reintentamos con espera creciente —1, 2, 4, 8, 16 y 32
minutos— y verás cada intento en el panel, con opción de reintentar a mano.

**Tu endpoint debe ser idempotente.** Recibir dos veces el mismo evento es
posible —un reintento tras un timeout en el que la entrega sí llegó— y
revalidar dos veces no cuesta nada; procesar un cobro o enviar un email desde
aquí, sí.

### Cambios de URL

Cuando se cambia el slug de un contenido publicado, el payload incluye
`previousSlug`. **Invalida las dos**: sin la antigua, la página vieja se queda
publicada en tu web para siempre.

```json
{
  "event": "post.updated",
  "data": { "slug": "caso-fintech", "previousSlug": "rediseno-plataforma-fintech" }
}
```

### Papelera

Mover contenido a la papelera emite `post.deleted`, no `post.updated`: para tu
web es una baja y la página debe retirarse. Restaurarlo emite `post.published`.
Vaciar la papelera después **no** genera un evento nuevo — ya se avisó al
entrar en ella.

---

## Ejemplo completo (Next.js)

```ts
// lib/kontororu.ts
const BASE = process.env.KONTORORU_URL!;
const KEY = process.env.KONTORORU_API_KEY!; // secreta: sólo en servidor

async function get<T>(path: string, tags: string[]): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
    next: { tags }, // los invalida tu endpoint de revalidación
  });
  if (!res.ok) throw new Error(`Kontorōru ${res.status}: ${path}`);
  return res.json();
}

export const getPosts = (params = "") =>
  get<{ data: Post[] }>(`/posts${params}`, ["posts"]);

export const getPost = (slug: string) =>
  get<{ data: Post }>(`/posts/${slug}`, ["posts", `post:${slug}`]);
```

```tsx
// app/blog/[slug]/page.tsx
export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const { data: post } = await getPost(slug);

  return (
    <article>
      <h1>{post.title}</h1>
      {post.cover && (
        <img src={post.cover.url} alt={post.cover.alt ?? ""}
             width={post.cover.width} height={post.cover.height} />
      )}
      <div dangerouslySetInnerHTML={{ __html: post.content.html }} />
    </article>
  );
}
```

> El `dangerouslySetInnerHTML` es aceptable **aquí** porque el HTML se sanea en
> nuestro servidor al guardar, con una allowlist de etiquetas y atributos. Si
> prefieres no depender de eso, usa `content.json` y renderiza tú.
