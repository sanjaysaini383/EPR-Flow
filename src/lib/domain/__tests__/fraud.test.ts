import { describe, expect, it } from "vitest";
import { checkDocument, DocumentError, safeFileName, sniffDocument } from "@/lib/files/sniff";
import { certificateSchema } from "@/lib/validation/certificate";
import {
  blocksApproval,
  checkCapacity,
  checkDates,
  checkDuplicates,
  checkPrice,
  checkRecycler,
  median,
  normalizeCertificateNumber,
  runFraudChecks,
  type CertificateFacts,
  type FraudContext,
  type RecyclerFacts,
} from "../fraud/checks";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const cert: CertificateFacts = {
  financialYear: "2026-27",
  categoryId: "cat-2",
  quantityKg: 40_000,
  issueDate: d("2026-08-10"),
  transferDate: d("2026-08-12"),
  pricePerKgInr: 9,
};
const recycler: RecyclerFacts = {
  verificationStatus: "VERIFIED",
  registrationValidFrom: d("2023-01-01"),
  registrationValidTo: d("2028-03-31"),
  registeredCategoryIds: ["cat-1", "cat-2"],
  capacityKg: 500_000,
};
const ctx: FraudContext = {
  today: d("2026-10-20"),
  sameOrgDuplicates: 0,
  otherOrgDuplicates: 0,
  duplicateFileCount: 0,
  recycler,
  issuedByRecyclerKg: 100_000,
  marketMedianPricePerKg: 10,
  marketSampleSize: 12,
};

describe("certificate numbers", () => {
  it("normalises case, spaces and dashes so look-alikes match", () => {
    expect(normalizeCertificateNumber(" epr / mh-0412 / 2026 – 001 ")).toBe("EPR/MH0412/2026001");
    expect(normalizeCertificateNumber("EPR/MH0412/2026001")).toBe(normalizeCertificateNumber("epr/mh-0412/2026-001"));
  });
});

describe("fraud checks", () => {
  it("passes a clean certificate", () => {
    expect(runFraudChecks(cert, ctx)).toEqual([]);
  });

  it("flags duplicates without identifying the other organisation", () => {
    const flags = checkDuplicates({ ...ctx, otherOrgDuplicates: 1, duplicateFileCount: 2 });
    expect(flags.map((f) => [f.type, f.severity])).toEqual([
      ["DUPLICATE_CROSS_TENANT", "HIGH"],
      ["DUPLICATE_FILE", "HIGH"],
    ]);
    expect(flags[0].message).toContain("claimed elsewhere on EPRFlow");
  });

  it("grades recycler problems by severity", () => {
    expect(checkRecycler(cert, { ...recycler, verificationStatus: "SUSPENDED" })[0]).toMatchObject({ type: "UNVERIFIED_RECYCLER", severity: "HIGH" });
    expect(checkRecycler(cert, { ...recycler, registrationValidTo: d("2026-06-30") })[0]).toMatchObject({ severity: "HIGH" });
    expect(checkRecycler(cert, { ...recycler, verificationStatus: "PENDING" })[0]).toMatchObject({ severity: "MEDIUM" });
    expect(checkRecycler(cert, { ...recycler, registeredCategoryIds: ["cat-1"] })).toEqual([expect.objectContaining({ type: "CATEGORY_MISMATCH", severity: "MEDIUM" })]);
    // Unknown capacity data is not evidence of a mismatch.
    expect(checkRecycler(cert, { ...recycler, registeredCategoryIds: null })).toEqual([]);
  });

  it("flags capacity overruns across all buyers", () => {
    expect(checkCapacity(cert, { ...ctx, issuedByRecyclerKg: 460_000 })).toEqual([]);
    const [flag] = checkCapacity(cert, { ...ctx, issuedByRecyclerKg: 470_000 });
    expect(flag).toMatchObject({ type: "CAPACITY_EXCEEDED", severity: "HIGH", details: { utilisation: 1.02 } });
    expect(checkCapacity(cert, { ...ctx, recycler: { ...recycler, capacityKg: null } })).toEqual([]);
  });

  it("collects every date problem into one flag", () => {
    const [flag] = checkDates({ ...cert, issueDate: d("2027-05-01"), transferDate: d("2027-04-01") }, recycler, ctx.today);
    expect(flag.type).toBe("SUSPICIOUS_DATE");
    expect(flag.details?.problems).toEqual([
      "the issue date is in the future",
      "the issue date is outside FY 2026-27",
      "the transfer date is before the issue date",
      "the transfer date is in the future",
    ]);
    expect(checkDates({ ...cert, issueDate: d("2026-05-01") }, { ...recycler, registrationValidFrom: d("2026-06-01") }, ctx.today)[0].message).toBe(
      "It was issued before the recycler was registered.",
    );
  });

  it("flags prices far from the market median only with enough samples", () => {
    expect(checkPrice({ ...cert, pricePerKgInr: 14.9 }, ctx)).toEqual([]);
    expect(checkPrice({ ...cert, pricePerKgInr: 16 }, ctx)[0]).toMatchObject({ type: "PRICE_OUTLIER", severity: "LOW" });
    expect(checkPrice({ ...cert, pricePerKgInr: 3 }, ctx)[0].message).toContain("70% below");
    expect(checkPrice({ ...cert, pricePerKgInr: 30 }, { ...ctx, marketSampleSize: 4 })).toEqual([]);
    expect(checkPrice({ ...cert, pricePerKgInr: null }, ctx)).toEqual([]);
  });

  it("blocks approval only on open high-severity flags", () => {
    expect(blocksApproval([{ severity: "HIGH", status: "OPEN" }])).toBe(true);
    expect(blocksApproval([{ severity: "HIGH", status: "DISMISSED" }, { severity: "MEDIUM", status: "OPEN" }])).toBe(false);
  });

  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("uploaded documents", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");

  it("identifies files by content, not name", () => {
    expect(sniffDocument(pdf)).toEqual({ mime: "application/pdf", ext: "pdf" });
    expect(sniffDocument(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffDocument(html)).toBeNull();
  });

  it("rejects disguised, empty and oversized files", () => {
    expect(() => checkDocument(html, ["application/pdf"])).toThrow(DocumentError);
    expect(() => checkDocument(new Uint8Array(), ["application/pdf"])).toThrow("The file is empty.");
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(pdf);
    expect(() => checkDocument(big, ["application/pdf"])).toThrow("larger than 4 MB");
    expect(() => checkDocument(pdf, ["image/png", "image/jpeg"])).toThrow("Upload a PNG or JPEG file.");
  });

  it("makes file names safe for headers and storage keys", () => {
    expect(safeFileName('../../etc/"pass wd".exe', "pdf")).toBe("etcpass-wd.pdf");
    expect(safeFileName("Certificate Q3 (final).PDF", "pdf")).toBe("Certificate-Q3-final.pdf");
    expect(safeFileName("प्रमाणपत्र.pdf", "pdf")).toBe("document.pdf");
  });
});

describe("certificate form", () => {
  const schema = certificateSchema(new Date("2026-10-20T06:00:00Z"));
  const base = {
    certificateNumber: "EPR/MH-0412/2026/000777",
    recyclerId: "clrecycler0000001",
    categoryId: "clcategory0000001",
    type: "RECYCLING",
    financialYear: "2026-27",
    quantity: "12.5",
    unit: "tonne",
    issueDate: "2026-08-10",
    transferDate: "",
    cost: "1,25,000",
  };

  it("converts units and works out the price per kg", () => {
    const r = schema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quantityKg).toBe(12_500);
      expect(r.data.pricePerKgInr).toBe(10);
      expect(r.data.transferDate).toBeUndefined();
    }
  });

  it("rejects future dates, transfers before issue and bad numbers", () => {
    const issue = (over: Record<string, string>) => schema.safeParse({ ...base, ...over }).error?.issues[0];
    expect(issue({ issueDate: "2026-12-01" })?.message).toBe("The issue date cannot be in the future");
    expect(issue({ transferDate: "2026-08-01" })).toMatchObject({ path: ["transferDate"], message: "The transfer date cannot be before the issue date" });
    expect(issue({ quantity: "0" })?.message).toBe("Enter a quantity greater than zero");
    expect(issue({ certificateNumber: "EPR<script>" })?.message).toBe("Use letters, digits and / - _ . only");
    expect(issue({ cost: "-5" })?.message).toBe("Enter the amount paid in rupees, e.g. 125000");
  });
});
