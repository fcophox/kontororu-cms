# Observabilidad

Errores y trazas con **Sentry**. Cubre los tres runtimes: servidor de Node,
edge (el middleware) y navegador.

---

## Activarlo

Sin DSN, Sentry no hace nada: `init()` es una función vacía y el envoltorio de
`next.config.ts` ni se aplica. Es lo que permite desarrollar y pasar los tests
sin cuenta, y por eso no hay ningún `if (sentryEnabled)` repartido por el
código.

Para encenderlo, en el entorno del despliegue:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://…@…ingest.sentry.io/…
```

Va con `NEXT_PUBLIC_` porque el navegador también reporta. El DSN no es un
secreto —va en el bundle por diseño— pero sí permite mandar eventos a tu
proyecto, así que ante abuso se rota desde Sentry.

Opcionales:

| Variable | Para qué |
|---|---|
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Subir source maps. Sin ellas el build no falla: sólo verás trazas minificadas. |
| `SENTRY_TRACES_SAMPLE_RATE` | Muestreo de rendimiento. Por defecto `0.1` en producción y `0` fuera. Los **errores no se muestrean nunca**. |

---

## Qué NO se envía

Es la parte que hay que leer antes de tocar nada de aquí. Está implementada en
[`src/lib/observability/scrub.ts`](../src/lib/observability/scrub.ts) y cubierta
por `tests/unit/observability-scrub.test.ts`.

Un servicio de errores acumula lo que nadie decidió mandar. En un CMS
multi-tenant eso es caro: una cookie de sesión en un panel de errores es una
sesión de administrador, y una API Key filtrada abre todo el contenido de un
cliente.

Se descarta:

- **Cabeceras con credenciales** — `authorization`, `cookie`, `apikey` y
  compañía. Se borran enteras, no se recortan.
- **Cookies** — la sesión del panel. No hay versión de esto que merezca la pena
  conservar.
- **El cuerpo de la petición** — es lo único que puede llevar contenido de un
  cliente: un borrador sin publicar, un formulario, las variables de una
  consulta GraphQL.
- **Parámetros sensibles de la query** (`token`, `secret`, `signature`…). El
  resto se conserva: sin `locale` ni `category` una URL no sirve para
  reproducir nada.
- **Datos personales** — `sendDefaultPii: false`, y del usuario se guarda sólo
  el `id`, nunca correo ni IP.
- **Secretos incrustados en texto libre** — API Keys `kntr_live_…`, JWT y
  `Bearer …` se sustituyen dentro de mensajes, excepciones y migas. Es la vía
  por la que se escapan de verdad: nadie manda una clave a propósito, pero un
  `fetch failed` la arrastra dentro de una URL firmada.

También quedan fuera dos integraciones por el mismo motivo:

- **Session Replay.** Graba la pantalla, y la pantalla aquí es el contenido sin
  publicar de un cliente. Su enmascarado va por heurística sobre el DOM y el
  editor es contenido enriquecido: un caso mal enmascarado deja un borrador
  ajeno en un servicio de terceros.
- **La instrumentación de Postgres.** El SQL que genera PostgREST lleva dentro
  los filtros, incluido el `tenant_id` y cualquier término de búsqueda escrito
  por una persona.

## Qué sí se envía

- El error, su traza y la ruta.
- **`tenant` y `plan` como etiquetas.** Es lo que convierte «hay 300 errores» en
  «hay 300 errores y todos son del mismo cliente», que son dos incidencias
  distintas. Se ponen en `authenticateAndMeter`, así que toda la API pública
  las lleva sin que cada ruta haga nada.
- **El `digest`** de los boundaries de React. Es la referencia que ve la persona
  en pantalla: con ella, un aviso de «me sale el error abc123» lleva directo al
  evento.

---

## Dónde se reporta

| Sitio | Qué recoge |
|---|---|
| `src/instrumentation.ts` → `onRequestError` | Server Components, rutas de API y acciones de servidor |
| `src/app/error.tsx`, `(dashboard)/[tenantSlug]/error.tsx` | Fallos de render en el panel |
| `src/app/global-error.tsx` | El root layout entero. Si salta, no ha llegado a montarse nada |
| `reportError()` | Errores que la aplicación **se traga** devolviendo un 500 |

`reportError()` existe por el último caso, que es el peor de diagnosticar: la
API responde `server_error`, el cliente ve un 500 educado y en el servidor sólo
queda una línea de log que nadie mira.

Los eventos del navegador salen por `/monitoring` (`tunnelRoute`). Sin ese
túnel, los bloqueadores de anuncios se comen los errores del panel y parece que
no hay ninguno.

---

## Comprobarlo

Los tests unitarios cubren el saneado, que es lo que puede romperse en
silencio: si falla, todo sigue funcionando y las claves aparecen en un panel de
terceros.

```bash
npx vitest run tests/unit/observability-scrub.test.ts
```

Para verificar el circuito completo hace falta un DSN real. Con él configurado,
un build de producción debe subir los source maps y `/monitoring` debe
responder. La prueba de que funciona es provocar un error en el panel y verlo
aparecer con su etiqueta `tenant`.
