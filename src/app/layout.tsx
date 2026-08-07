import type { Metadata } from "next";
import { Sansation } from "next/font/google";
import "@/styles/globals.css";

import { ThemeScript } from "@/components/theme-script";
import { DEFAULT_THEME } from "@/lib/theme/mode";

// El nombre de la variable lo consume `fonts.sans` en tokens.yml.
// Sansation no es variable: hay que declarar los pesos disponibles (300/400/700).
const sansation = Sansation({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-sansation",
});

export const metadata: Metadata = {
  title: { default: "Kontorōru CMS", template: "%s · Kontorōru" },
  description: "CMS Headless Multi-tenant de Rukma Studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // El servidor pinta el tema por defecto; <ThemeScript> corrige la clase
  // antes del primer paint si el usuario eligió el otro.
  return (
    <html
      lang="es"
      className={`${sansation.variable} ${DEFAULT_THEME}`}
      style={{ colorScheme: DEFAULT_THEME }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
