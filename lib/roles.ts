/**
 * Role vocabulary. Mirrors lib/roles.ts in the vantro web repo.
 *
 * users.role is migrating from 'installer', which is construction-only
 * language, to 'field'. Both are accepted on read for one release so a
 * half-updated fleet cannot lock anyone out.
 *
 * To close the window: delete LEGACY_FIELD_ROLE and its references.
 */

export const FIELD_ROLE = 'field';
export const LEGACY_FIELD_ROLE = 'installer';

export function isFieldRole(role?: string | null): boolean {
  return role === FIELD_ROLE || role === LEGACY_FIELD_ROLE;
}

export function isFieldOrSupervisor(role?: string | null): boolean {
  return isFieldRole(role) || role === 'foreman' || role === 'subcontractor';
}
