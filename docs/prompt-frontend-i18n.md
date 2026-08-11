# Prompt para el proyecto de front end

> Copia todo lo que hay debajo de la línea y pégalo como primer mensaje en el
> proyecto de la web. Sustituye antes los tres valores entre `<>`.

---

Necesito que la web sirva el contenido en el idioma que el visitante elija.
El CMS (Kontorōru) ya guarda cada idioma como una entrada independiente y lo
expone por su API headless. Falta el lado de la web.

## Cómo funciona el modelo de idiomas

Cada idioma de un artículo es **una entrada completa**: su propio título, su
propio SEO y su propio estado de publicación. Lo que las une es un grupo de
traducción interno que la API resuelve por ti — no tienes que conocerlo.

**El slug es compartido entre idiomas y está siempre en inglés.** Un artículo
titulado "Los agentes de IA ya no piden permiso" vive en
`ai-agents-no-longer-ask-for-permission` tanto en `/blog/…` como en
`/en/blog/…`. Sólo cambia el idioma que pidas.

Aun así, **no lo des por sentado al construir enlaces**: hay contenido antiguo
—creado antes de esta regla— cuyas versiones tienen slugs distintos, y un
editor puede cambiar la URL a mano. Para enlazar de un idioma a otro usa
siempre el campo `translations` de la respuesta, nunca el slug actual. Con eso
funcionan los dos casos sin que tengas que distinguirlos.

## La regla del idioma

Esto es lo más importante del encargo, y es donde una implementación ingenua
falla: **el idioma es del visitante, no de la página.**

Una vez elegido, se mantiene hasta que él lo cambie. En concreto:

- Si la portada está en inglés y pulsa un artículo, **el artículo se abre en
  inglés**. No vuelve al español porque sea el idioma por defecto del CMS.
- Lo mismo con cualquier otra navegación interna: menú, categorías,
  paginación, migas, enlaces dentro del cuerpo de un artículo. Todos conservan
  el idioma activo.
- Si desde el artículo cambia a español, **cambia ahí mismo**: misma noticia,
  otro idioma, sin volver a la portada ni perder el sitio.
- Ese cambio también es persistente: a partir de ahí sigue navegando en
  español.

La forma limpia de conseguirlo es que **el idioma viaje en la URL** (un
prefijo `/en/…`, con el español sin prefijo o con `/es/…`, como prefieras) y
que todos los enlaces internos se construyan a partir del idioma activo, nunca
codificados a mano. Si además quieres recordar la preferencia entre visitas,
guárdala en una cookie y úsala **sólo** para decidir a dónde mandar a quien
entra a la raíz — nunca para sobrescribir el idioma que la URL ya indica, o
un enlace compartido se abriría en el idioma equivocado.

Cuidado con el caso incómodo: si está en inglés y abre un artículo que sólo
existe en español, no lo dejes en 404. Sirve la versión española avisando de
que esa traducción no está disponible, y mantén el resto de la web en inglés.

## La API

Base: `<URL_DEL_CMS>/api/v1`
Auth: `Authorization: Bearer <API_KEY>` en todas las peticiones.
Idiomas activos: `es` (principal) y `en`.

### Listado

```
GET /api/v1/posts?locale=en&limit=20
```

Parámetros: `locale`, `limit`, `cursor`, `category`, `tag`, `q`.
Sin `locale` devuelve el idioma principal del espacio (`es`).
Si pides un idioma no activado responde `400`.

```json
{
  "data": [ /* … posts sin cuerpo … */ ],
  "pagination": { "hasMore": true, "nextCursor": "2026-08-10T12:00:00Z" }
}
```

La paginación es por cursor: pasa el `nextCursor` recibido como `?cursor=`.

### Detalle

```
GET /api/v1/posts/{slug}?locale=en
```

**Acepta el slug de cualquier idioma.** Si el visitante está en la página
española y pulsa "EN", puedes pedir el mismo slug con `?locale=en` y la API
devuelve la versión inglesa — aunque esa versión tenga otro slug, por ser
contenido antiguo o por una edición manual. Mira siempre el campo `slug` de la
respuesta: si no coincide con el que pediste, redirige a esa URL para que la
canónica sea correcta.

Si esa traducción no existe o no está publicada, responde `404`.

### Forma de un post

```jsonc
{
  "data": {
    "id": "uuid",
    "slug": "ai-agents-no-longer-ask-for-permission…",
    "locale": "en",
    "translations": { "es": "los-agentes-de-ia-ya-no-piden-permiso…" },
    "title": "AI agents no longer ask for permission…",
    "excerpt": "…",
    "publishedAt": "2026-08-10T12:00:00Z",
    "updatedAt": "2026-08-10T12:00:00Z",
    "readingTime": 6,
    "seo": { "title": "…", "description": "…" },
    "customFields": {},
    "category": { "id": "uuid", "slug": "blog", "name": "Blog", "kind": "BLOG" },
    "cover": { "id": "uuid", "url": "https://…", "alt": "…", "width": 1600, "height": 900 },
    "tags": [{ "id": "uuid", "slug": "ia", "name": "IA" }],
    "content": { "html": "<p>…</p>", "json": { "type": "doc", "content": [] } }
  }
}
```

`content` **sólo viene en el detalle**; el listado no lo trae.

Dos campos que resuelven casi todo el trabajo de i18n:

- `locale` — en qué idioma está esto.
- `translations` — mapa `idioma → slug` de las **otras** versiones, y sólo las
  que están publicadas. Si está vacío, no hay traducción disponible: el
  selector de idioma no debe ofrecerla.

Un detalle importante: **el slug de las categorías es el mismo en todos los
idiomas**, sólo cambia el `name`. Así que `?category=blog&locale=en` funciona
sin que tengas que traducir el filtro.

Los errores llegan como `{ "error": { "code": "not_found", "message": "…" } }`.
Las URLs de imagen vienen firmadas y caducan a las 24 h — no las guardes en
base de datos ni las metas en un build estático de larga vida.

## Lo que quiero que implementes

1. **Rutas por idioma.** Que la web sirva `/en/…` además de las actuales, y que
   cada petición al CMS lleve el `locale` correspondiente.

2. **Idioma persistente al navegar.** Todo enlace interno conserva el idioma
   activo: portada → artículo, categoría → artículo, paginación, menú. Que no
   quede ni un `href` con el idioma escrito a mano — pásalos todos por un
   helper que anteponga el prefijo del idioma actual.

3. **Selector de idioma que cambia en el sitio.** En un artículo, el botón
   "ES"/"EN" lleva a **esa misma noticia** en el otro idioma, usando el slug
   que venga en `translations`. En una portada o un listado, al equivalente de
   esa página. Si el idioma no está en `translations`, el botón se muestra
   desactivado o no se muestra — **nunca** enlazando a una URL que dará 404.

4. **Fallback al entrar directo.** Si alguien llega a `/en/blog/<slug>` con un
   slug que en inglés es otro (un enlace viejo, un compartido), pide el detalle
   con `?locale=en` usando ese mismo slug y **redirige 301 al slug que devuelva
   la API**. La API ya resuelve la equivalencia; tú sólo tienes que comparar el
   `slug` de la respuesta con el de la URL y redirigir si difieren.

5. **SEO.** En cada página, `<link rel="alternate" hreflang="…">` para cada
   entrada de `translations` más la propia, y `hreflang="x-default"` apuntando
   al español. La canónica siempre a la URL del idioma que se está sirviendo.

6. **Sitemap.** Una entrada por idioma, cada una con su URL real.

## Cómo comprobar que está bien

El recorrido que tiene que funcionar entero, en este orden:

1. Portada en español → cambia a inglés → **la portada se queda en inglés**.
2. Desde ahí, clic en un artículo → **el artículo abre en inglés**, sin volver
   al español.
3. En ese artículo, cambia a español → **la misma noticia en español**, sin
   salir a la portada.
4. Vuelve atrás con el botón del navegador y sigue navegando: el idioma es el
   que dejaste, no el de por defecto.

Y estos casos sueltos:

- Un artículo que sólo existe en español: el selector no ofrece "EN" como
  enlace roto. Y si llegas a él estando en inglés, lo ves en español con un
  aviso, no un 404.
- Un artículo cuyas versiones tengan slugs distintos (los hay, de antes de la
  regla del slug compartido): entra a mano a `/en/blog/<slug-español>` y debe
  redirigir 301 al slug inglés.
- Mira el HTML: `hreflang` presente y apuntando a URLs que responden 200.
- El listado en `/en` no mezcla artículos en español.
- Busca en el código `href` internos con el idioma escrito a mano: no debería
  quedar ninguno.

Empieza revisando cómo consume hoy la web el CMS y dime qué hace falta cambiar
antes de tocar nada.
