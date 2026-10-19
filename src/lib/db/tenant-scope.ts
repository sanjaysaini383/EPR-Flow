/**
 * Pure argument rewriting used by the tenant-scoped Prisma client (tenant.ts).
 * Kept free of Prisma imports so it can be unit-tested without a database.
 *
 * Rules
 * - TENANT models: every read/write is filtered by organizationId, every create
 *   gets organizationId, and updates can never change organizationId.
 * - Organization: scoped by `id` instead (a tenant can only touch itself); no create/delete.
 * - SHARED models (organizationId nullable, e.g. Recycler): reads see the tenant's rows
 *   plus platform rows (organizationId = null); writes only touch the tenant's rows.
 * - GLOBAL models (reference data): read-only.
 * - Anything else (User, Account, Session…) is rejected — use the base client in auth code.
 *
 * Callers must use scalar foreign keys (`categoryId: "…"`) rather than relation
 * `connect` on the top-level data of tenant models. Passing organizationId on create
 * is allowed (Prisma's types require it) but it must equal the current tenant.
 */

export const TENANT_MODELS = new Set([
  "Membership",
  "Invitation",
  "Brand",
  "GstRegistration",
  "Plant",
  "MaterialEntry",
  "ImportBatch",
  "ObligationSnapshot",
  "Budget",
  "RecyclerRating",
  "Certificate",
  "CertificateFlag",
  "StoredFile",
  "Extraction",
  "Deadline",
  "Reminder",
  "Alert",
  "Report",
  "AuditLog",
]);

export const SHARED_MODELS = new Set(["Recycler"]);
export const GLOBAL_READONLY_MODELS = new Set(["MaterialCategory", "RegulationRule", "RecyclerCapacity"]);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WHERE_OPS = new Set([...READ_OPS, "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

export class TenantScopeError extends Error {}

type Args = Record<string, unknown> | undefined;
type Data = Record<string, unknown>;

function withoutOrgId(data: unknown): unknown {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const { organizationId: _ignored, organization: _ignoredRel, ...rest } = data as Data;
    return rest;
  }
  return data;
}

function withOrgId(data: unknown, orgId: string): Data {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TenantScopeError("create data must be an object");
  }
  const d = data as Data;
  if ("organization" in d) {
    throw new TenantScopeError("Pass organizationId as a scalar, not an `organization` relation");
  }
  if (d.organizationId !== undefined && d.organizationId !== orgId) {
    throw new TenantScopeError("organizationId does not match the current tenant");
  }
  return { ...(data as Data), organizationId: orgId };
}

export function scopeArgs(model: string, operation: string, args: Args, orgId: string): Args {
  const a: Record<string, unknown> = { ...(args ?? {}) };

  if (GLOBAL_READONLY_MODELS.has(model)) {
    if (!READ_OPS.has(operation)) throw new TenantScopeError(`${model} is read-only for tenants`);
    return a;
  }

  if (model === "Organization") {
    if (!READ_OPS.has(operation) && operation !== "update") {
      throw new TenantScopeError(`Operation ${operation} on Organization is not allowed for tenants`);
    }
    a.where = { ...((a.where as Data) ?? {}), id: orgId };
    if (operation === "update") {
      const { id: _id, ...data } = (a.data as Data) ?? {};
      a.data = data;
    }
    return a;
  }

  if (SHARED_MODELS.has(model)) {
    if (READ_OPS.has(operation)) {
      const where = (a.where as Data) ?? {};
      const and = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
      a.where = { ...where, AND: [...and, { OR: [{ organizationId: orgId }, { organizationId: null }] }] };
      return a;
    }
  }

  if (!TENANT_MODELS.has(model) && !SHARED_MODELS.has(model)) {
    throw new TenantScopeError(`Model ${model} is not accessible through the tenant client`);
  }

  if (WHERE_OPS.has(operation)) {
    a.where = { ...((a.where as Data) ?? {}), organizationId: orgId };
    if (operation.startsWith("update")) a.data = withoutOrgId(a.data);
    return a;
  }

  if (CREATE_OPS.has(operation)) {
    a.data = Array.isArray(a.data) ? a.data.map((d) => withOrgId(d, orgId)) : withOrgId(a.data, orgId);
    return a;
  }

  if (operation === "upsert") {
    a.where = { ...((a.where as Data) ?? {}), organizationId: orgId };
    a.create = withOrgId(a.create, orgId);
    a.update = withoutOrgId(a.update);
    return a;
  }

  throw new TenantScopeError(`Operation ${operation} on ${model} is not supported by the tenant client`);
}
