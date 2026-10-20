import { describe, expect, it } from "vitest";
import { gstinCheckDigit } from "../gstin";
import { errorRowsForDownload, mapHeaders, matchCategory, validateImport, type ImportContext } from "../materials/import";

const withCheck = (first14: string) => first14 + gstinCheckDigit(first14);
const MH_GSTIN = withCheck("27AAACD1234F1Z");
const KA_GSTIN = withCheck("29AAACD1234F1Z");

const ctx: ImportContext = {
  categories: [
    { id: "c1", code: "PLASTIC_CAT_I", name: "Category I – Rigid plastic packaging", stream: "PLASTIC" },
    { id: "c2", code: "PLASTIC_CAT_II", name: "Category II – Flexible plastic packaging", stream: "PLASTIC" },
    { id: "c3", code: "PLASTIC_CAT_III", name: "Category III – Multi-layered plastic packaging", stream: "PLASTIC" },
    { id: "c4", code: "PLASTIC_CAT_IV", name: "Category IV – Compostable plastic packaging", stream: "PLASTIC" },
    { id: "e1", code: "EWASTE_ITEW", name: "IT & telecommunication equipment", stream: "EWASTE" },
  ],
  enabledStreams: ["PLASTIC"],
  entityTypes: ["BRAND_OWNER", "PRODUCER"],
  brands: [{ id: "b1", name: "FreshBite Snacks" }],
  plants: [{ id: "p1", name: "Pune Packaging Unit", stateCode: "MH" }],
  gstins: [
    { id: "g1", gstin: MH_GSTIN, stateCode: "MH" },
    { id: "g2", gstin: KA_GSTIN, stateCode: "KA" },
  ],
  today: new Date("2026-10-20T00:00:00Z"),
};

const HEADERS = ["Month", "Category", "Entity Type", "State", "Quantity", "Unit", "Brand", "Plant", "GSTIN", "Recycled Content", "Pre-consumer", "Notes"];
const row = (over: Record<string, unknown> = {}) => ({
  Month: "2025-07",
  Category: "Cat II",
  "Entity Type": "Brand Owner",
  State: "MH",
  Quantity: "1,250.5",
  Unit: "kg",
  ...over,
});

describe("mapHeaders", () => {
  it("recognises common header spellings", () => {
    const map = mapHeaders(["Reporting Month", "Plastic Category", "QTY", "UOM", "State Code", "GST No", "Remarks"]);
    expect([...map.values()]).toEqual(["month", "category", "quantity", "unit", "state", "gstin", "notes"]);
  });
});

describe("matchCategory", () => {
  it.each(["Cat II", "cat 2", "Category II", "II", "2", "PLASTIC_CAT_II", "Category II – Flexible plastic packaging"])(
    "matches %s to Cat II",
    (value) => expect(matchCategory(value, ctx)?.id).toBe("c2"),
  );

  it("does not match categories of streams the org has not enabled", () => {
    expect(matchCategory("ITEW", ctx)).toBeNull();
    expect(matchCategory("ITEW", { ...ctx, enabledStreams: ["EWASTE"] })?.id).toBe("e1");
  });
});

describe("validateImport", () => {
  it("normalises a valid row", () => {
    const r = validateImport([row({ Brand: "freshbite snacks", Plant: "Pune Packaging Unit", GSTIN: MH_GSTIN, "Recycled Content": "100", "Pre-consumer": "no", Notes: " Q2 batch " })], HEADERS, ctx);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toEqual({
      row: 2,
      data: {
        periodMonth: "2025-07-01",
        financialYear: "2025-26",
        categoryId: "c2",
        entityType: "BRAND_OWNER",
        stateCode: "MH",
        brandId: "b1",
        plantId: "p1",
        gstRegistrationId: "g1",
        quantityKg: "1250.500",
        recycledContentKg: "100.000",
        isPreConsumer: false,
        notes: "Q2 batch",
      },
    });
  });

  it("converts tonnes to kg and accepts month names", () => {
    const r = validateImport([row({ Month: "Mar 2026", Quantity: "2.5", Unit: "MT" })], HEADERS, ctx);
    expect(r.valid[0].data).toMatchObject({ periodMonth: "2026-03-01", financialYear: "2025-26", quantityKg: "2500.000" });
  });

  it("derives state from the GSTIN or plant when the state column is blank", () => {
    const r = validateImport([row({ State: "", GSTIN: KA_GSTIN }), row({ State: "", Plant: "Pune Packaging Unit", Month: "2025-08" })], HEADERS, ctx);
    expect(r.valid.map((v) => v.data.stateCode)).toEqual(["KA", "MH"]);
  });

  it("reports every problem in a row with its column and spreadsheet row number", () => {
    const r = validateImport(
      [row(), row({ Month: "2030-01", Category: "Cat IX", Quantity: "-5", State: "Atlantis", "Entity Type": "Importer" })],
      HEADERS,
      ctx,
    );
    expect(r.valid).toHaveLength(1);
    expect(r.errors.map((e) => [e.row, e.column, e.message])).toEqual([
      [3, "month", "Month cannot be in the future"],
      [3, "category", "Unknown category — use e.g. Cat I, Cat II, Cat III or Cat IV"],
      [3, "entity_type", "Your organisation is not registered with this entity type"],
      [3, "state", "Unknown state — use a code like MH or a name like Maharashtra"],
      [3, "quantity", "Quantity must be a number"],
    ]);
  });

  it("explains when a category's waste stream is not enabled", () => {
    const r = validateImport([row({ Category: "ITEW" })], HEADERS, ctx);
    expect(r.errors[0].message).toMatch(/not enabled for your organisation/);
  });

  it("rejects unknown brands, plants and GSTINs, and GSTIN/state mismatches", () => {
    const r = validateImport(
      [row({ Brand: "Nope" }), row({ Plant: "Ghost Plant", Month: "2025-08" }), row({ GSTIN: KA_GSTIN, Month: "2025-09" }), row({ GSTIN: "27AAAAA0000A1Z0", Month: "2025-10" })],
      HEADERS,
      ctx,
    );
    expect(r.errors.map((e) => e.message)).toEqual([
      "Unknown brand — add it under Brands first",
      "Unknown plant — add it under Plants first",
      "GSTIN is registered in KA, but the row's state is MH",
      "GSTIN checksum does not match",
    ]);
  });

  it("flags duplicates within the same file", () => {
    const r = validateImport([row(), row({ Quantity: "99" })], HEADERS, ctx);
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ row: 3, message: "Duplicate of row 2 (same month, category, state, brand and plant)" });
  });

  it("checks recycled content, units and yes/no values", () => {
    const r = validateImport(
      [row({ "Recycled Content": "5000" }), row({ Unit: "pounds", Month: "2025-08" }), row({ "Pre-consumer": "maybe", Month: "2025-09" })],
      HEADERS,
      ctx,
    );
    expect(r.errors.map((e) => e.column)).toEqual(["recycled_content", "unit", "pre_consumer"]);
  });

  it("skips blank rows and enforces required columns and row limits", () => {
    expect(validateImport([row(), { Month: "", Quantity: " " }], HEADERS, ctx).totalRows).toBe(1);
    expect(validateImport([], ["Month", "Quantity"], ctx).fileErrors[0]).toBe(
      "Missing required columns: category, entity_type, state",
    );
    expect(validateImport([], HEADERS, ctx).fileErrors[0]).toBe("The file has no data rows");
  });

  it("defaults the entity type when the organisation has only one", () => {
    const single = { ...ctx, entityTypes: ["PRODUCER"] };
    const r = validateImport([{ Month: "2025-07", Category: "Cat I", State: "MH", Quantity: "10" }], ["Month", "Category", "State", "Quantity"], single);
    expect(r.valid[0].data.entityType).toBe("PRODUCER");
  });

  it("produces downloadable error rows with the reasons", () => {
    const rows = [row(), row({ Quantity: "abc", Month: "2025-08" })];
    const r = validateImport(rows, HEADERS, ctx);
    expect(errorRowsForDownload(rows, r.errors)).toEqual([{ ...rows[1], errors: "quantity: Quantity must be a number" }]);
  });
});
