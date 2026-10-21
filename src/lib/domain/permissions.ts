/** Mirrors the Prisma `Role` enum; kept here so domain code has no Prisma dependency. */
export const ROLES = ["ADMIN", "COMPLIANCE_MANAGER", "CONSULTANT", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  COMPLIANCE_MANAGER: "Compliance Manager",
  CONSULTANT: "Consultant",
  VIEWER: "Viewer",
};

const ALL: readonly Role[] = ROLES;
const EDITORS: readonly Role[] = ["ADMIN", "COMPLIANCE_MANAGER", "CONSULTANT"];

/** Single source of truth for what each role may do. See docs/PHASE-0-PLAN.md §8. */
export const PERMISSIONS = {
  "org.view": ALL,
  "org.manage": ["ADMIN"],
  "members.manage": ["ADMIN"],
  "data.write": EDITORS,
  "certificates.write": EDITORS,
  "certificates.approve": ["ADMIN"],
  "costs.view": EDITORS,
  "budgets.manage": ["ADMIN"],
  "flags.dismiss": EDITORS,
  "audit.view": EDITORS,
  "reports.export": ALL,
  "deadlines.manage": EDITORS,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
