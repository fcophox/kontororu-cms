import type { TenantLimits } from "@/lib/content/json";

/**
 * Planes comerciales de Kontorōru.
 *
 * Vive en el código y no en una tabla a propósito: los planes cambian con el
 * despliegue, no en caliente, y tenerlos aquí permite que un cambio de precios
 * pase por revisión de código. Los límites REALES de cada tenant están en
 * `tenants.limits`, que Rukma Studio puede ajustar caso por caso — un cliente
 * grande puede tener PRO con el doble de almacenamiento sin inventar un plan.
 */

export type TenantPlan = "FREE" | "PRO" | "ENTERPRISE";

export const PLANS: Record<TenantPlan, { label: string; limits: TenantLimits }> = {
  FREE: {
    label: "Free",
    limits: { maxUsers: 3, maxPosts: 100, maxStorageMb: 1024, maxApiKeys: 2 },
  },
  PRO: {
    label: "Pro",
    limits: { maxUsers: 10, maxPosts: 2000, maxStorageMb: 20480, maxApiKeys: 10 },
  },
  ENTERPRISE: {
    label: "Enterprise",
    limits: { maxUsers: 100, maxPosts: 100000, maxStorageMb: 512000, maxApiKeys: 50 },
  },
};

export const TENANT_STATUSES = ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const STATUS_LABELS: Record<TenantStatus, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  CANCELLED: "Cancelado",
};

/** Un tenant fuera de estos estados no puede acceder al panel ni servir API. */
export function isOperational(status: TenantStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/** Porcentaje de consumo, acotado a 100 para no romper las barras. */
export function usageRatio(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
