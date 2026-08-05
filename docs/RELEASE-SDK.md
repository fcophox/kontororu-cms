# Publicar el SDK

`@rukma/kontororu-client` se publica en **npm público** bajo licencia MIT.

Publicar es irreversible: una versión no se puede sobrescribir, y `npm
unpublish` sólo está disponible durante 72 h y rompe a quien ya la instaló. De
ahí que el orden de abajo sea el que es — todo lo que se puede comprobar, se
comprueba antes.

---

## Antes de publicar

```bash
npm run test:unit && npm run test:security && npm run test:integration
npm run sdk:check
```

`sdk:check` es el que importa aquí y no lo cubre ningún otro: empaqueta el
tarball de verdad, lo instala en un proyecto limpio y lo importa desde fuera.

La suite prueba el SDK desde su **código fuente** (alias `@sdk`), que es lo que
hace que un cambio en la API falle en el acto. El precio de esa decisión es que
nada mira el paquete: un `exports` incompleto, un fichero fuera del tarball o
un `.d.ts` que no resuelve pasan todos los tests y aparecen en el primer `npm
i` de un cliente, cuando ya no se puede republicar esa versión.

## Versión

La versión vive en `packages/kontororu-client/package.json` y se sube a mano.

Lo que sale por el SDK es contrato con las webs de tus clientes, así que el
criterio es el del consumidor, no el del repo:

- **patch** — corrección que no cambia ninguna firma.
- **minor** — método o campo nuevo. Añadir `graphql()` fue esto.
- **major** — cualquier cosa que obligue a tocar código ajeno: renombrar un
  campo de la respuesta, cambiar un tipo, quitar un método.

Mientras esté en `0.x`, npm trata **minor como ruptura** en los rangos `^`. Es
el momento de romper cosas barato; en cuanto se publique `1.0.0` deja de serlo.

## Publicar

```bash
npm whoami                      # que la sesión sea la cuenta correcta
npm --prefix packages/kontororu-client publish
```

`prepublishOnly` compila antes, y `publishConfig.access` ya está en `public`:
sin eso, un paquete con ámbito se publica como restringido y npm lo rechaza
con un 402 que no menciona el ámbito por ninguna parte.

Si la cuenta tiene 2FA, npm pedirá el OTP.

## Después

```bash
npm view @rukma/kontororu-client
```

Y una instalación real desde un proyecto cualquiera, que es la única prueba
que cuenta:

```bash
npm i @rukma/kontororu-client
```

Etiqueta el commit para poder volver a él:

```bash
git tag sdk-v0.1.0 && git push --tags
```

---

## Lo que queda fuera

- **`repository`, `homepage` y `bugs`** no están en el `package.json` porque el
  repo no tiene remoto. En cuanto lo tenga, conviene añadirlos: son los enlaces
  que npm muestra en la ficha del paquete.
- **Es un paquete ESM.** No hay build dual y montarlo traería tooling nuevo
  (tsup o rollup) para un caso —consumidores CommonJS en Node 18 o 20— que hoy
  no existe: las webs de los clientes van con Next. Está documentado en el
  README del paquete.
