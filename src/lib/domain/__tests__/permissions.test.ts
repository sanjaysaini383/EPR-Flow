import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES } from "../permissions";
import { slugify } from "../slug";

describe("permissions", () => {
  it("only admins approve certificates and manage members", () => {
    expect(can("ADMIN", "certificates.approve")).toBe(true);
    expect(can("COMPLIANCE_MANAGER", "certificates.approve")).toBe(false);
    expect(can("CONSULTANT", "members.manage")).toBe(false);
  });

  it("viewers can view but never write", () => {
    expect(can("VIEWER", "org.view")).toBe(true);
    const writes = Object.keys(PERMISSIONS).filter((p) => p !== "org.view") as (keyof typeof PERMISSIONS)[];
    for (const p of writes) expect(can("VIEWER", p)).toBe(false);
  });

  it("every role can view the org", () => {
    for (const role of ROLES) expect(can(role, "org.view")).toBe(true);
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Hindustan Foods & Beverages Pvt. Ltd.")).toBe("hindustan-foods-and-beverages-pvt-ltd");
    expect(slugify("  Café Ünïcode  ")).toBe("cafe-unicode");
    expect(slugify("---")).toBe("");
  });
});
