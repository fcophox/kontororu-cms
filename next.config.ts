import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
  /*
   * `next dev` y `next build` escriben en el mismo `.next` y se corrompen
   * mutuamente: compilar mientras el servidor de desarrollo corre deja
   * manifiestos a medias y produce 500 opacos en rutas que funcionaban.
   *
   * El script `dev` apunta a `.next-dev`; producción mantiene `.next` para no
   * alterar lo que espera el proveedor de despliegue.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  experimental: {
    // Habilita forbidden() / unauthorized() en next/navigation, usados por
    // los guards de rol en src/lib/auth/guards.ts.
    authInterrupts: true,
  },

  images: {
    remotePatterns: [
      // Logos y medios servidos desde el Storage del tenant.
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/**" },
    ],
  },

  async headers() {
    return [
      {
        // La API headless la consumen front-ends de terceros desde su propio
        // dominio. El aislamiento lo da la API Key, no el origen: CORS abierto
        // aquí no amplía la superficie de ataque.
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization,Content-Type" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

/*
 * El envoltorio de Sentry sólo se aplica si hay DSN.
 *
 * Sin esa condición, el plugin se mete en TODOS los builds —también los
 * locales y los de CI, que no tienen ni DSN ni token— y avisa por cada
 * compilación de que no puede subir los source maps. Un aviso que sale
 * siempre y que nadie puede resolver acaba siendo un aviso que nadie lee, y
 * el día que salga uno de verdad tampoco se leerá.
 */
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Sin token no se suben los source maps, pero el build sigue adelante:
      // preferimos un despliegue con trazas ilegibles a un despliegue caído.
      authToken: process.env.SENTRY_AUTH_TOKEN,

      silent: true,

      /*
       * Los source maps se suben y se BORRAN del bundle público.
       *
       * Publicarlos deja a la vista la lógica del servidor —los guards, la
       * forma de las consultas, los nombres de las tablas— a cualquiera que
       * abra las devtools.
       */
      sourcemaps: { deleteSourcemapsAfterUpload: true },

      // Túnel propio para los eventos del navegador: sin él, los bloqueadores
      // de anuncios se comen los errores del panel y parece que no hay ninguno.
      tunnelRoute: "/monitoring",

      // Quita los logs de depuración del SDK del bundle del navegador.
      webpack: { treeshake: { removeDebugLogging: true } },

      telemetry: false,
    })
  : nextConfig;
