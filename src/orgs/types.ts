/**
 * Tipos de organización (tenant).
 *
 * La organización de Clerk ES el tenant de Goossip. Un usuario puede pertenecer
 * a varias; dentro de cada una tiene un rol. Fuera de la org no ve nada.
 *
 * NOTA MEDIDA (16-sep-2026): el plan gratuito de Clerk NO permite roles
 * personalizados — `POST /v1/organization_roles` con `org:owner` devuelve 402
 * `unsupported_subscription_plan_features` (`org:roles`). Por eso en Clerk solo
 * existen `org:admin` y `org:member`, y `org:owner` se DERIVA: es dueño quien
 * creó la org (`organizations.owner_user_id`, que Clerk llena con `created_by`).
 * El día que el plan suba, basta crear el rol en Clerk: `resolveOrgRole` ya lo
 * respeta si viene en el token.
 */

export const ORG_ROLES = ['org:owner', 'org:admin', 'org:member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_PLANS = ['free', 'pro', 'agency'] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const ORG_STATUSES = ['active', 'suspended'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const WEBHOOK_SOURCES = ['meta', 'whatsapp', 'clerk'] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return ORG_ROLES.includes(value as OrgRole);
}

export function isOrgPlan(value: unknown): value is OrgPlan {
  return ORG_PLANS.includes(value as OrgPlan);
}

export function isOrgStatus(value: unknown): value is OrgStatus {
  return ORG_STATUSES.includes(value as OrgStatus);
}

/**
 * Rol efectivo dentro de la org. `ownerClerkId` gana sobre lo que diga el token
 * porque en el plan gratuito el creador también sale como `org:admin`.
 */
export function resolveOrgRole(
  tokenRole: string | null | undefined,
  clerkUserId: string | null | undefined,
  ownerClerkId: string | null | undefined,
): OrgRole {
  if (clerkUserId && ownerClerkId && clerkUserId === ownerClerkId) return 'org:owner';
  if (isOrgRole(tokenRole)) return tokenRole;
  return 'org:member';
}

/** Quién puede tocar canales, reglas y facturación. El member solo opera leads. */
export function canManageOrg(role: OrgRole): boolean {
  return role === 'org:owner' || role === 'org:admin';
}

/** Borrar la org: solo el dueño. */
export function canDeleteOrg(role: OrgRole): boolean {
  return role === 'org:owner';
}
