import { forbidden } from "next/navigation";
import { getTenantContext } from "./tenant-context";
import { atLeast, PERMISSIONS, type Permission, type TenantRole } from "./roles";

/**
 * Guards de servidor. La lógica pura de roles vive en `roles.ts`, que sí puede
 * importarse desde componentes cliente; este módulo añade la resolución del
 * tenant y el corte de la petición, que sólo tienen sentido en servidor.
 */

export { atLeast, can, PERMISSIONS } from "./roles";
export type { Permission, TenantRole } from "./roles";

/** Uso en Server Components y Server Actions: `const ctx = await requireRole(slug, "ADMIN")` */
export async function requireRole(slug: string, minimum: TenantRole) {
  const ctx = await getTenantContext(slug);
  if (!ctx.user.isSuperadmin && !atLeast(ctx.role, minimum)) forbidden();
  return ctx;
}

export async function requirePermission(slug: string, permission: Permission) {
  return requireRole(slug, PERMISSIONS[permission]);
}
