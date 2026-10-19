import "server-only";
import { prisma } from "./client";
import { scopeArgs } from "./tenant-scope";

/**
 * Prisma client that is hard-wired to one organization. Every query on a tenant
 * model gets `organizationId` injected; see tenant-scope.ts for the exact rules.
 */
export function getTenantDb(organizationId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Record<string, unknown>, organizationId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof getTenantDb>;
