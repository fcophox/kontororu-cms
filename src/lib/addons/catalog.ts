/**
 * Catálogo de complementos de Rukma Studio.
 *
 * Vive en código, no en la base: activar un complemento es enlazar a una
 * pantalla y a un endpoint que se despliegan con esta aplicación. Si el
 * catálogo fuese una tabla, se podría activar algo que este despliegue no
 * sabe renderizar y el cliente se comería un 404 con nombre comercial.
 *
 * Módulo PURO: lo importan tanto la sidebar (cliente) como las acciones de
 * servidor. Nada de `next/headers` ni de Supabase aquí.
 */

import { Calendar, Heart, Inbox, type LucideIcon } from "lucide-react";

export type AddonKey = "calendar" | "contacts" | "reactions";

export type Addon = {
  key: AddonKey;
  name: string;
  /** Una línea en la tarjeta: qué resuelve, no cómo. */
  summary: string;
  description: string;
  icon: LucideIcon;
  /** Ruta propia del complemento, relativa al espacio. `null` = sin pantalla. */
  configPath: string | null;
  /** Texto del enlace a esa pantalla: no todos los complementos se "configuran". */
  actionLabel: string;
  /**
   * Todos los complementos están incluidos mientras dure la fase inicial.
   * Cuando pasen a ser de pago, este campo es el único sitio que cambia.
   */
  billing: "INCLUDED" | "PAID";
  /** Lo que verá el cliente donde luego irá el precio. */
  priceLabel: string;
};

export const ADDONS: readonly Addon[] = [
  {
    key: "calendar",
    name: "Calendario",
    summary: "Publica tu disponibilidad para que te agenden.",
    description:
      "Define tu horario de atención y bloquea los días o tramos que no quieras ofrecer. La disponibilidad queda accesible por la API para el formulario de agenda de tu web.",
    icon: Calendar,
    configPath: "/addons/calendar",
    actionLabel: "Configurar",
    billing: "INCLUDED",
    priceLabel: "Incluido",
  },
  {
    key: "contacts",
    name: "Contactos",
    summary: "Recibe y gestiona lo que llega por tus formularios.",
    description:
      "Una bandeja única para todos los formularios de tu web, separados por tipo. Lee, archiva y responde sin salir del panel.",
    icon: Inbox,
    configPath: "/addons/contacts",
    actionLabel: "Abrir bandeja",
    billing: "INCLUDED",
    priceLabel: "Incluido",
  },
  {
    key: "reactions",
    name: "Reacciones",
    summary: "Cuenta cuánta gente aprecia cada contenido.",
    description:
      "Tu web pone el gesto —un me gusta, un aplauso, una carita— y aquí ves cuántas personas lo han pulsado en cada contenido. El número es del contenido, no de cada traducción.",
    icon: Heart,
    configPath: "/addons/reactions",
    actionLabel: "Ver reacciones",
    billing: "INCLUDED",
    priceLabel: "Incluido",
  },
] as const;

export function findAddon(key: string): Addon | undefined {
  return ADDONS.find((a) => a.key === key);
}

export function isAddonKey(key: string): key is AddonKey {
  return ADDONS.some((a) => a.key === key);
}
