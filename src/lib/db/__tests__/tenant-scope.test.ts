import { describe, expect, it } from "vitest";
import { scopeArgs, TENANT_MODELS, TenantScopeError } from "../tenant-scope";

const ORG = "org_a";

describe("scopeArgs — tenant models", () => {
  it("adds organizationId to every read, overriding any caller value", () => {
    for (const op of ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]) {
      expect(scopeArgs("Brand", op, { where: { name: "X", organizationId: "org_b" } }, ORG)).toEqual({
        where: { name: "X", organizationId: ORG },
      });
    }
    expect(scopeArgs("Brand", "findMany", undefined, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it("scopes updates/deletes and strips organizationId from update data", () => {
    expect(
      scopeArgs("Brand", "update", { where: { id: "b1" }, data: { name: "Y", organizationId: "org_b" } }, ORG),
    ).toEqual({ where: { id: "b1", organizationId: ORG }, data: { name: "Y" } });
    expect(scopeArgs("Brand", "deleteMany", { where: { id: "b1" } }, ORG)).toEqual({
      where: { id: "b1", organizationId: ORG },
    });
  });

  it("injects organizationId on create and createMany", () => {
    expect(scopeArgs("Brand", "create", { data: { name: "Z" } }, ORG)).toEqual({
      data: { name: "Z", organizationId: ORG },
    });
    expect(scopeArgs("Brand", "createMany", { data: [{ name: "A" }, { name: "B", organizationId: ORG }] }, ORG)).toEqual({
      data: [
        { name: "A", organizationId: ORG },
        { name: "B", organizationId: ORG },
      ],
    });
  });

  it("rejects creates for another tenant or via relation connect", () => {
    expect(() => scopeArgs("Brand", "create", { data: { name: "Z", organizationId: "org_b" } }, ORG)).toThrow(
      TenantScopeError,
    );
    expect(() =>
      scopeArgs("Brand", "create", { data: { name: "Z", organization: { connect: { id: "org_b" } } } }, ORG),
    ).toThrow(TenantScopeError);
  });

  it("scopes upsert on all three branches", () => {
    expect(
      scopeArgs(
        "Budget",
        "upsert",
        { where: { id: "x" }, create: { amountInr: 1 }, update: { amountInr: 2, organizationId: "org_b" } },
        ORG,
      ),
    ).toEqual({
      where: { id: "x", organizationId: ORG },
      create: { amountInr: 1, organizationId: ORG },
      update: { amountInr: 2 },
    });
  });

  it("covers every tenant model", () => {
    for (const model of TENANT_MODELS) {
      expect(scopeArgs(model, "findMany", {}, ORG)).toEqual({ where: { organizationId: ORG } });
    }
  });
});

describe("scopeArgs — special models", () => {
  it("restricts Organization to the current tenant and blocks create/delete", () => {
    expect(scopeArgs("Organization", "findUnique", { where: { slug: "other" } }, ORG)).toEqual({
      where: { slug: "other", id: ORG },
    });
    expect(scopeArgs("Organization", "update", { where: {}, data: { name: "N", id: "hijack" } }, ORG)).toEqual({
      where: { id: ORG },
      data: { name: "N" },
    });
    expect(() => scopeArgs("Organization", "delete", { where: { id: ORG } }, ORG)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Organization", "create", { data: {} }, ORG)).toThrow(TenantScopeError);
  });

  it("lets shared models read tenant + platform rows but write only tenant rows", () => {
    expect(scopeArgs("Recycler", "findMany", { where: { stateCode: "MH" } }, ORG)).toEqual({
      where: { stateCode: "MH", AND: [{ OR: [{ organizationId: ORG }, { organizationId: null }] }] },
    });
    expect(scopeArgs("Recycler", "update", { where: { id: "r1" }, data: { name: "R" } }, ORG)).toEqual({
      where: { id: "r1", organizationId: ORG },
      data: { name: "R" },
    });
  });

  it("keeps existing AND clauses on shared reads", () => {
    const result = scopeArgs("Recycler", "findMany", { where: { AND: { name: "x" } } }, ORG);
    expect(result?.where).toEqual({
      AND: [{ name: "x" }, { OR: [{ organizationId: ORG }, { organizationId: null }] }],
    });
  });

  it("makes reference data read-only", () => {
    expect(scopeArgs("MaterialCategory", "findMany", {}, ORG)).toEqual({});
    expect(() => scopeArgs("RegulationRule", "update", { where: { id: "r" }, data: {} }, ORG)).toThrow(
      TenantScopeError,
    );
  });

  it("rejects auth models entirely", () => {
    for (const model of ["User", "Account", "Session", "VerificationToken"]) {
      expect(() => scopeArgs(model, "findMany", {}, ORG)).toThrow(TenantScopeError);
    }
  });
});
