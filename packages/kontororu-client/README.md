# @rukma/kontororu-client

Cliente oficial de **Kontorōru CMS**. Contenido tipado y verificación de
webhooks, sin dependencias.

```bash
npm i @rukma/kontororu-client
```

## Empezar

```ts
import { createClient } from "@rukma/kontororu-client";

export const cms = createClient({
  url: process.env.KONTORORU_URL!,      // con o sin /api/v1
  apiKey: process.env.KONTORORU_API_KEY!, // SECRETA: sólo en servidor
});
```

> La API Key da acceso de lectura a todo tu contenido publicado. Úsala desde
> el servidor (Server Component, Route Handler, `getStaticProps`), **nunca**
> desde el navegador.

## Leer contenido

```ts
const { data, pagination } = await cms.listPosts({ limit: 10, category: "blog" });

const post = await cms.getPost("rediseno-plataforma-fintech");
post.content.html   // saneado en el servidor, listo para inyectar
post.content.json   // el documento, si prefieres tus propios componentes

const categorias = await cms.listCategories();
```

Para recorrerlo todo —un sitemap, un índice de búsqueda— hay un generador que
pagina solo:

```ts
for await (const post of cms.iteratePosts()) {
  // llega según se descarga, sin cargar miles de entradas en memoria
}
```

## Idiomas

Sin `locale` recibes el idioma principal del espacio. Cada entrada trae sus
hermanas, listas para `hreflang`:

```tsx
const post = await cms.getPost(slug, { locale: "en" });

<link rel="alternate" hrefLang={post.locale} href={`/${post.locale}/${post.slug}`} />
{Object.entries(post.translations).map(([locale, slug]) => (
  <link key={locale} rel="alternate" hrefLang={locale} href={`/${locale}/${slug}`} />
))}
```

Lo que no está traducido **no desaparece**: llega en el idioma que sí exista,
empezando por el principal. `post.locale` dice cuál es de verdad, así que
puedes marcarlo o esconderlo tú:

```tsx
{post.locale !== "en" && <p>Disponible sólo en español</p>}
```

Si prefieres que falte, pasa `{ fallback: "none" }` — en `listPosts`,
`getPost` (404) y `listCategories` (conteos estrictos).

## Errores

```ts
import { KontororuError } from "@rukma/kontororu-client";

try {
  return await cms.getPost(slug);
} catch (error) {
  if (error instanceof KontororuError && error.isNotFound) notFound();
  throw error;
}
```

`error.code` es estable (`unauthorized`, `not_found`, `rate_limited`…), así
que puedes ramificar sin parsear mensajes. Los fallos temporales —429 y 5xx—
se reintentan solos respetando `Retry-After`; una clave inválida no, porque
insistir sólo gasta cupo.

## Webhooks

```ts
// app/api/revalidate/route.ts
import { verifyWebhook, affectedTags } from "@rukma/kontororu-client/webhooks";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  try {
    const payload = verifyWebhook({
      body: await request.text(),   // en CRUDO, sin parsear
      headers: request.headers,
      secret: process.env.KONTORORU_WEBHOOK_SECRET!,
    });

    for (const tag of affectedTags(payload)) revalidateTag(tag);
    return Response.json({ revalidated: true });
  } catch {
    return new Response("firma no válida", { status: 401 });
  }
}
```

Tres cosas que `verifyWebhook` resuelve y que es fácil equivocar a mano:

- **Compara en tiempo constante.** Un `===` corta en el primer byte distinto,
  y esa diferencia basta para reconstruir una firma válida.
- **Comprueba el timestamp.** Un reenvío capturado lleva una firma
  perfectamente válida: lo único que lo delata es su edad.
- **Firma sobre el cuerpo en crudo.** Parsear y volver a serializar puede
  reordenar claves y tumbar la verificación de entregas legítimas.

`affectedTags()` incluye la **URL anterior** cuando un contenido cambió de
slug —si no, la página vieja se queda publicada para siempre— y las de las
**traducciones**, cuyo selector de idioma apunta a la que acaba de cambiar.

## Imágenes

Las URLs vienen firmadas con 24 h de validez. Pídelas en cada build o
revalidación; no las guardes en tu base de datos. Si necesitas renovar una
suelta, `cms.getMedia(id)` devuelve una fresca.

## Caché en Next.js

Cada método etiqueta sus peticiones (`posts`, `post:<slug>`, `categories`,
`media`), que es lo que `affectedTags()` invalida. Para ajustarlo:

```ts
await cms.listPosts({ limit: 10 }, { tags: ["home"], revalidate: 3600 });
```

## Cupo

```ts
await cms.listPosts();
cms.lastRateLimit; // { limit, remaining, resetAt }
```
