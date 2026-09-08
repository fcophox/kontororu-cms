/**
 * Lógica de roles PURA — sin imports de servidor.
 *
 * Vive separada de `guards.ts` a propósito: la UI necesita `can()` para ocultar
 * controles, y `guards.ts` importa `tenant-context`, que a su vez importa
 * `next/headers`. Importarlo desde un componente cliente arrastraría código de
 * servidor al bundle del navegador.
 *
 * Esto NO es la frontera de seguridad — esa es RLS. Sirve para no mostrar
 * botones que llevarían a un 403.
 */

export type TenantRole = "OWNER" | "ADMIN" | "EDITOR" | "CONTRIBUTOR";

const RANK: Record<TenantRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  CONTRIBUTOR: 1,
};

export function atLeast(role: TenantRole, minimum: TenantRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export const PERMISSIONS = {
  "content.create": "CONTRIBUTOR",
  "content.editAny": "EDITOR",
  "content.publish": "EDITOR",
  "content.delete": "ADMIN",
  "taxonomy.manage": "EDITOR",
  "media.deleteAny": "EDITOR",
  "team.manage": "ADMIN",
  "branding.manage": "ADMIN",
  "apiKeys.manage": "ADMIN",
  "webhooks.manage": "ADMIN",
  // Activar un complemento será facturable: lo decide quien administra el
  // espacio, no quien escribe en él.
  "addons.manage": "ADMIN",
  "billing.manage": "OWNER",
} as const satisfies Record<string, TenantRole>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: TenantRole, permission: Permission): boolean {
  return atLeast(role, PERMISSIONS[permission]);
}
