# Prompt para el proyecto de front end — Reacciones

> Copia todo lo que hay debajo de la línea y pégalo como primer mensaje en el
> proyecto de la web. Sustituye antes los dos valores entre `<>`.

---

Necesito un componente de reacción para las páginas de contenido: quien lee un
artículo puede pulsar un gesto —un me gusta, un aplauso, una carita— y ver
cuánta gente lo ha pulsado antes. El contador vive en el CMS (Kontorōru), que
ya expone el endpoint. Falta el lado de la web.

## Qué hay que construir

Un componente reutilizable que:

1. Al montarse, muestra el número actual de reacciones del contenido.
2. Al pulsarlo, suma una y actualiza el número.
3. Recuerda que esa persona ya reaccionó, y no la deja sumar dos veces.

Va al final del artículo, pero tiene que servir también en una tarjeta de
listado, así que **no asumas dónde se coloca**: el componente recibe qué
contenido es y se dibuja donde lo pongan.

## La API

Base: `<URL_DEL_CMS>/api/v1`
Espacio: `<SLUG_DEL_ESPACIO>` (es el identificador público del cliente en el
CMS; va en cada petición).

**No lleva clave de API.** Es el único endpoint del CMS que no la lleva, y es
deliberado: lo llama el navegador de quien lee, y una clave dentro del bundle
la vería cualquiera con F12. No busques dónde configurar credenciales — no hay.

### Leer los contadores

```
GET /api/v1/reactions?tenant=<SLUG_DEL_ESPACIO>&slug=mi-articulo
```

```json
{ "data": { "slug": "mi-articulo", "totals": { "like": 12, "clap": 31 } } }
```

`totals` es un mapa `gesto → número`. Un contenido al que nadie ha reaccionado
devuelve `{}` con un **200**, no un 404: cero es una respuesta legítima. Un
slug que no existe devuelve exactamente lo mismo, así que no uses este endpoint
para comprobar si un artículo existe.

### Sumar una reacción

```
POST /api/v1/reactions
Content-Type: application/json

{ "tenant": "<SLUG_DEL_ESPACIO>", "slug": "mi-articulo", "reaction": "like" }
```

```json
{ "data": { "slug": "mi-articulo", "reaction": "like", "total": 13 } }
```

Devuelve el total **ya incrementado** de ese gesto: píntalo directamente, no
hagas un segundo `GET` para refrescar.

`reaction` es opcional y por defecto vale `"like"`. Si usas otro gesto, la
clave debe cumplir `^[a-z][a-z0-9_-]{1,39}$` — minúsculas, números, guion y
guion bajo. `"clap"` y `"smile"` valen; `"Me Gusta"` da un 400. No hay que dar
de alta el gesto en ninguna parte: el primer clic lo crea.

### Errores

Todos con la forma `{ "error": { "code": "...", "message": "..." } }`:

| Código | HTTP | Cuándo |
|---|---|---|
| `bad_request` | 400 | Falta un parámetro o el gesto tiene formato inválido |
| `not_found` | 404 | No hay contenido publicado con ese slug en ese espacio, **o el cliente ha desactivado el complemento** |
| `rate_limited` | 429 | Más de 60 peticiones por minuto desde esa IP. Trae cabecera `Retry-After` |
| `server_error` | 500 | Fallo del CMS |

El 404 no distingue "no existe" de "es un borrador" de "complemento apagado", a
propósito. Trátalo como "aquí no se puede reaccionar" y **no muestres un error
al lector**: esconde el componente o déjalo inerte. Que el CMS esté mal
configurado no es problema de quien está leyendo.

## Reglas de comportamiento

**Una reacción por persona, y vive en su navegador.** El servidor no guarda
nada del visitante —ni IP, ni cookie, ni huella—, así que el límite lo pones tú
con `localStorage`, con una clave por contenido y gesto (por ejemplo
`reaction:mi-articulo:like`). Es una barrera de cortesía, no de seguridad: si
alguien la salta, ha inflado un contador de aplausos y ya está. No montes nada
más pesado para evitarlo.

**Optimista, pero honesto.** Pinta el número nuevo en cuanto pulsan, sin
esperar a la respuesta — la latencia de red no debe notarse en un botón así.
Si el `POST` falla con 429 o 500, **revierte** el número y borra la marca de
`localStorage`, para que puedan volver a intentarlo. Si falla con 404, deja el
estado como "ya reaccionado" y no vuelvas a llamar: reintentar no lo va a
arreglar.

**El contador es del contenido, no del idioma.** Si la web es multiidioma, el
artículo en español y su traducción al inglés comparten el número: quien pulse
en `/en/blog/…` suma al mismo contador que quien pulse en `/blog/…`. Pasa el
slug de la versión que se está viendo y el CMS lo resuelve. No sumes ni
combines nada por tu cuenta, y no guardes en `localStorage` una marca distinta
por idioma o la misma persona podría reaccionar una vez por traducción.

**Cero se dibuja distinto.** Un artículo sin reacciones no debe enseñar un "0"
grande y triste. Enseña el botón con su invitación y saca el número sólo
cuando lo haya.

## Compatibilidad — lo que suele romperse

Estos cuatro puntos son el motivo de que este encargo tenga letra pequeña:

1. **El `POST` sale del navegador, no de tu servidor.** El cupo del CMS es de
   60 peticiones por minuto **por IP**. Si lo proxias por una route handler
   tuya, todas las reacciones de toda la web salen de la misma IP y el sitio
   entero se queda sin cupo con veinte lectores simultáneos. El endpoint tiene
   CORS abierto justamente para que lo llames directo.

2. **El `GET` inicial puede ir por servidor**, y en una página de artículo es
   lo suyo: el número aparece ya pintado, sin parpadeo. La respuesta se cachea
   10 s en el CDN, así que no la marques `no-store` ni la metas en el caché
   de larga duración de tu framework.

3. **No hay endpoint por lotes.** Pintar el contador en un listado de veinte
   artículos son veinte peticiones. Si lo necesitas, pídelas en paralelo desde
   el servidor al construir la página; si no lo necesitas, no lo hagas — el
   sitio natural del componente es la página del artículo.

4. **Nada de esto puede correr en el render del servidor tocando
   `localStorage`.** El estado "ya reaccionó" sólo se conoce en el cliente, así
   que léelo después de montar. Si pintas el botón como "ya pulsado" durante el
   SSR, tendrás un desajuste de hidratación en cada carga.

## Accesibilidad

Es un `<button>` de verdad, no un `<div>` con `onClick`. Necesita:

- Texto accesible que incluya la cuenta y el estado
  (`aria-label="Me gusta este artículo. 12 reacciones"`).
- `aria-pressed` reflejando si esa persona ya reaccionó.
- `disabled` mientras el `POST` está en vuelo, para no disparar dos.
- El cambio de número anunciado con `aria-live="polite"`, para quien no ve la
  animación.
- Si animas el gesto, respeta `prefers-reduced-motion`.

## Qué no hacer

- No inventes un endpoint de "quitar la reacción". No existe: el contador sólo
  sube. Si quieres que se pueda deshacer, dímelo y lo hablamos con el CMS
  antes de escribir nada.
- No guardes ni envíes nada que identifique al lector. El diseño del CMS
  depende de que no exista ese dato.
- No metas una librería para esto. Es `fetch`, `localStorage` y un botón.
