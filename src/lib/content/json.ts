import type { JSONContent } from "@tiptap/react";

/**
 * Frontera JSONB ↔ TypeScript.
 *
 * Postgres devuelve `jsonb` como `Json`, una unión que incluye `string`,
 * `number` y `null`. El código de la app espera objetos. Estos helpers hacen
 * la conversión en un solo sitio, con un valor por defecto sensato, en lugar
 * de repartir `as any` por las páginas.
 *
 * No son validación: un `custom_fields` corrupto pasaría igual. Son la
 * garantía mínima de que un `null` en la base no revienta el render.
 */

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

export function asJsonContent(value: unknown): JSONContent {
  const record = asRecord(value);
  return "type" in record ? (record as JSONContent) : EMPTY_DOC;
}

export function asSeo(value: unknown): { title?: string; description?: string } {
  const record = asRecord(value);
  return {
    title: typeof record.title === "string" ? record.title : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
  };
}

export type TenantUsage = {
  users: number;
  posts: number;
  storageMb: number;
  apiKeys: number;
};

export function asUsage(value: unknown): TenantUsage {
  const record = asRecord(value);
  const num = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : 0);
  return {
    users: num("users"),
    posts: num("posts"),
    storageMb: num("storageMb"),
    apiKeys: num("apiKeys"),
  };
}

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function asContentStatus(value: string): ContentStatus | null {
  return (CONTENT_STATUSES as readonly string[]).includes(value)
    ? (value as ContentStatus)
    : null;
}

export type TenantLimits = {
  maxUsers: number;
  maxPosts: number;
  maxStorageMb: number;
  maxApiKeys: number;
};

const DEFAULT_LIMITS: TenantLimits = {
  maxUsers: 3,
  maxPosts: 100,
  maxStorageMb: 1024,
  maxApiKeys: 2,
};

export function asLimits(value: unknown): TenantLimits {
  const record = asRecord(value);
  const num = (key: keyof TenantLimits) =>
    typeof record[key] === "number" ? (record[key] as number) : DEFAULT_LIMITS[key];
  return {
    maxUsers: num("maxUsers"),
    maxPosts: num("maxPosts"),
    maxStorageMb: num("maxStorageMb"),
    maxApiKeys: num("maxApiKeys"),
  };
}
