import type { NextConfig } from "next";

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
    /*
     * Las imágenes del panel se sirven con URL firmada, y el optimizador
     * cachea su versión optimizada indexada por esa URL. Al revalidar vuelve a
     * pedir la MISMA URL, así que este valor tiene que quedar por debajo del
     * TTL de la firma más corta en juego — la de Medios, 1 h. Si lo igualara,
     * la revalidación caería justo cuando el token acaba de caducar y el
     * usuario vería un hueco roto sin que nada hubiera fallado.
     *
     * Media hora es también la ventana de caché de firma de
     * `lib/storage/factory`: cada URL se optimiza una vez por ventana.
     */
    minimumCacheTTL: 1800,

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

export default nextConfig;
