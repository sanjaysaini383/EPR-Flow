import { describe, expect, it } from "vitest";
import { safeCallbackUrl, signupSchema } from "../auth";
import { cleanText } from "../common";
import { organizationDetailsSchema } from "../organization";

const cp = (n: number) => String.fromCodePoint(n);

describe("cleanText", () => {
  it("removes control, zero-width and bidi-override characters", () => {
    expect(cleanText(`Ac${cp(0x202e)}me${cp(0x200b)}${cp(0x07)} Ltd `)).toBe("Acme Ltd");
  });

  it("keeps normal Indian-language text", () => {
    expect(cleanText("  हिंदी ब्रांड  ")).toBe("हिंदी ब्रांड");
  });
});

describe("safeCallbackUrl", () => {
  it("allows only same-site relative paths", () => {
    expect(safeCallbackUrl("/o/acme/dashboard")).toBe("/o/acme/dashboard");
    expect(safeCallbackUrl("//evil.com")).toBe("/o");
    expect(safeCallbackUrl("/\\evil.com")).toBe("/o");
    expect(safeCallbackUrl("https://evil.com")).toBe("/o");
    expect(safeCallbackUrl(undefined, "/x")).toBe("/x");
  });
});

describe("signupSchema", () => {
  const base = { name: "Asha", email: "asha@acme.in", password: "GoodPass123" };

  it("accepts a valid signup", () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  it("rejects weak or email-based passwords with clear messages", () => {
    const issues = (password: string) =>
      signupSchema.safeParse({ ...base, password }).error?.issues.map((i) => i.message) ?? [];
    expect(issues("short1")).toContain("Use at least 10 characters");
    expect(issues("onlyletterspass")).toContain("Include at least one number");
    expect(issues("Password1234")).toContain("This password is too common — choose another");
    expect(issues("asha12345678")).toContain("Password must not contain your email name");
  });

  it("rejects names made only of invisible characters", () => {
    expect(signupSchema.safeParse({ ...base, name: `${cp(0x200b)}${cp(0x200b)}` }).success).toBe(false);
  });
});

describe("organizationDetailsSchema", () => {
  const base = { name: "Acme", entityTypes: ["PRODUCER"], wasteStreams: ["PLASTIC"], headOfficeState: "MH" };

  it("normalises PAN and rejects malformed identifiers", () => {
    expect(organizationDetailsSchema.parse({ ...base, pan: " aaacd1234f " }).pan).toBe("AAACD1234F");
    const result = organizationDetailsSchema.safeParse({ ...base, pan: "123", cin: "bad" });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["pan", "cin"]);
  });

  it("rejects unknown enum values and de-duplicates arrays", () => {
    expect(organizationDetailsSchema.safeParse({ ...base, entityTypes: ["HACKER"] }).success).toBe(false);
    expect(organizationDetailsSchema.parse({ ...base, wasteStreams: ["PLASTIC", "PLASTIC"] }).wasteStreams).toEqual([
      "PLASTIC",
    ]);
  });
});
