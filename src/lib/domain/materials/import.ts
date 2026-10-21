/**
 * Validates and normalises rows from a "material placed on market" CSV/Excel upload.
 * Pure: the caller supplies the organisation's reference data, so this has no DB access
 * and every rule is unit-tested.
 */
import { validateGstin } from "../gstin";
import { checkReportingMonth, financialYearOf, monthKey, parseMonth } from "../financial-year";
import { INDIAN_STATES } from "../states";
import { kgString, MAX_QUANTITY_KG, parseNumber, parseUnit, toKg } from "../units";

export const MAX_IMPORT_ROWS = 5000;

export type ImportContext = {
  categories: { id: string; code: string; name: string; stream: string }[];
  enabledStreams: string[];
  entityTypes: string[]; // the organisation's entity types
  brands: { id: string; name: string }[];
  plants: { id: string; name: string; stateCode: string }[];
  gstins: { id: string; gstin: string; stateCode: string }[];
  today: Date;
};

export type NormalisedRow = {
  periodMonth: string; // "2025-07-01"
  financialYear: string;
  categoryId: string;
  entityType: string;
  stateCode: string;
  brandId: string | null;
  plantId: string | null;
  gstRegistrationId: string | null;
  quantityKg: string;
  recycledContentKg: string | null;
  isPreConsumer: boolean;
  notes: string | null;
};

export type RowError = { row: number; column: string; message: string; value?: string };

export type ImportResult = {
  totalRows: number;
  valid: { row: number; data: NormalisedRow }[];
  errors: RowError[];
  /** Problems with the file itself (missing columns, too many rows). */
  fileErrors: string[];
};

// ── Columns ───────────────────────────────────────────────────────────────

export const COLUMNS = {
  month: ["month", "period", "periodmonth", "reportingmonth", "monthyear"],
  category: ["category", "materialcategory", "plasticcategory", "cat"],
  entity_type: ["entitytype", "entity", "pibotype", "role"],
  state: ["state", "statecode"],
  quantity: ["quantity", "quantitykg", "qty", "weight", "weightkg", "quantityplacedonmarket"],
  unit: ["unit", "uom", "units"],
  brand: ["brand", "brandname"],
  plant: ["plant", "plantname", "facility", "unitname"],
  gstin: ["gstin", "gst", "gstno", "gstnumber"],
  recycled_content: ["recycledcontent", "recycledcontentkg", "recycled"],
  pre_consumer: ["preconsumer", "preconsumerwaste", "ispreconsumer"],
  notes: ["notes", "note", "remarks", "comment", "comments"],
} as const;

export type Column = keyof typeof COLUMNS;

/** Template header row, in display order. */
export const TEMPLATE_HEADERS: Column[] = [
  "month",
  "category",
  "entity_type",
  "state",
  "quantity",
  "unit",
  "brand",
  "plant",
  "gstin",
  "recycled_content",
  "pre_consumer",
  "notes",
];

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/** Maps whatever headers the file uses onto our canonical column names. */
export function mapHeaders(headers: string[]): Map<string, Column> {
  const map = new Map<string, Column>();
  for (const header of headers) {
    const key = norm(header);
    for (const [column, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
      if ((aliases as readonly string[]).includes(key) && ![...map.values()].includes(column)) {
        map.set(header, column);
        break;
      }
    }
  }
  return map;
}

// ── Lookups ───────────────────────────────────────────────────────────────

const ROMAN: Record<string, string> = { "1": "i", "2": "ii", "3": "iii", "4": "iv" };

/** Accepts codes ("PLASTIC_CAT_II"), names, and shorthand like "Cat II", "Category 2", "II", "ITEW". */
export function matchCategory(raw: unknown, ctx: Pick<ImportContext, "categories" | "enabledStreams">) {
  let v = norm(raw);
  if (!v) return null;
  v = v.replace(/^(category|cat)/, "");
  if (ROMAN[v]) v = ROMAN[v];
  return (
    ctx.categories.find((c) => {
      if (!ctx.enabledStreams.includes(c.stream)) return false;
      const suffix = norm(c.code.replace(/^[A-Z]+_/, "")).replace(/^cat/, "");
      return norm(c.code) === norm(raw) || norm(c.name) === norm(raw) || suffix === v;
    }) ?? null
  );
}

const ENTITY_ALIASES: Record<string, string> = {
  producer: "PRODUCER",
  p: "PRODUCER",
  importer: "IMPORTER",
  i: "IMPORTER",
  brandowner: "BRAND_OWNER",
  bo: "BRAND_OWNER",
};

/** State from a code ("MH") or name ("Maharashtra"), case- and space-insensitive. */
export function matchState(raw: unknown) {
  const v = norm(raw);
  return INDIAN_STATES.find((s) => norm(s.code) === v || norm(s.name) === v)?.code ?? null;
}

function parseBoolean(raw: unknown): boolean | null {
  if (isBlank(raw)) return false;
  const v = norm(raw);
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return null;
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * @param rows objects keyed by the file's own header names (first row of the sheet)
 */
export function validateImport(rows: Record<string, unknown>[], headers: string[], ctx: ImportContext): ImportResult {
  const result: ImportResult = { totalRows: 0, valid: [], errors: [], fileErrors: [] };
  const headerMap = mapHeaders(headers);
  const present = new Set(headerMap.values());

  const required: Column[] = ["month", "category", "quantity"];
  if (ctx.entityTypes.length > 1) required.push("entity_type");
  const missing = required.filter((c) => !present.has(c));
  if (!present.has("state") && !present.has("gstin") && !present.has("plant")) missing.push("state");
  if (missing.length) {
    result.fileErrors.push(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    return result;
  }

  const dataRows = rows
    .map((raw, index) => ({ raw, row: index + 2 })) // +2: header is spreadsheet row 1
    .filter(({ raw }) => Object.values(raw).some((v) => !isBlank(v)));
  result.totalRows = dataRows.length;

  if (dataRows.length === 0) {
    result.fileErrors.push("The file has no data rows");
    return result;
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    result.fileErrors.push(`The file has ${dataRows.length} rows; the limit is ${MAX_IMPORT_ROWS} per upload`);
    return result;
  }

  const seen = new Map<string, number>();

  for (const { raw, row } of dataRows) {
    const get = (column: Column) => {
      for (const [header, col] of headerMap) if (col === column) return raw[header];
      return undefined;
    };
    const errors: RowError[] = [];
    const fail = (column: Column, message: string, value?: unknown) =>
      errors.push({ row, column, message, value: isBlank(value) ? undefined : String(value).slice(0, 100) });

    // Month
    const month = parseMonth(get("month"));
    if (!month) fail("month", isBlank(get("month")) ? "Month is required" : "Use a month like 2025-07 or Jul 2025", get("month"));
    else {
      const problem = checkReportingMonth(month, ctx.today);
      if (problem) fail("month", problem, get("month"));
    }

    // Category
    const category = matchCategory(get("category"), ctx);
    if (!category) {
      const anyStream = matchCategory(get("category"), { ...ctx, enabledStreams: ["PLASTIC", "EWASTE", "BATTERY"] });
      fail(
        "category",
        isBlank(get("category"))
          ? "Category is required"
          : anyStream
            ? `${anyStream.name} is not enabled for your organisation — turn on its waste stream in settings`
            : "Unknown category — use e.g. Cat I, Cat II, Cat III or Cat IV",
        get("category"),
      );
    }

    // Entity type
    let entityType: string | null = null;
    if (isBlank(get("entity_type")) && ctx.entityTypes.length === 1) entityType = ctx.entityTypes[0];
    else {
      entityType = ENTITY_ALIASES[norm(get("entity_type"))] ?? null;
      if (!entityType) fail("entity_type", isBlank(get("entity_type")) ? "Entity type is required" : "Use Producer, Importer or Brand Owner", get("entity_type"));
      else if (!ctx.entityTypes.includes(entityType)) {
        fail("entity_type", "Your organisation is not registered with this entity type", get("entity_type"));
      }
    }

    // GSTIN / plant / brand lookups
    let gst: ImportContext["gstins"][number] | undefined;
    if (!isBlank(get("gstin"))) {
      const check = validateGstin(String(get("gstin")));
      if (!check.valid) fail("gstin", check.reason, get("gstin"));
      else {
        gst = ctx.gstins.find((g) => g.gstin === check.gstin);
        if (!gst) fail("gstin", "This GSTIN is not registered for your organisation — add it under GST registrations", get("gstin"));
      }
    }
    let plant: ImportContext["plants"][number] | undefined;
    if (!isBlank(get("plant"))) {
      plant = ctx.plants.find((p) => norm(p.name) === norm(get("plant")));
      if (!plant) fail("plant", "Unknown plant — add it under Plants first", get("plant"));
    }
    let brand: ImportContext["brands"][number] | undefined;
    if (!isBlank(get("brand"))) {
      brand = ctx.brands.find((b) => norm(b.name) === norm(get("brand")));
      if (!brand) fail("brand", "Unknown brand — add it under Brands first", get("brand"));
    }

    // State (explicit, or derived from GSTIN / plant)
    let stateCode: string | null = null;
    if (!isBlank(get("state"))) {
      stateCode = matchState(get("state"));
      if (!stateCode) fail("state", "Unknown state — use a code like MH or a name like Maharashtra", get("state"));
    } else {
      stateCode = gst?.stateCode ?? plant?.stateCode ?? null;
      if (!stateCode && !gst && !plant) fail("state", "State is required (or give a GSTIN or plant)");
    }
    if (stateCode && gst && gst.stateCode !== stateCode) {
      fail("gstin", `GSTIN is registered in ${gst.stateCode}, but the row's state is ${stateCode}`, get("gstin"));
    }

    // Quantity
    const unit = parseUnit(get("unit"));
    if (!unit) fail("unit", "Use kg or tonne", get("unit"));
    const qty = parseNumber(get("quantity"));
    let quantityKg: number | null = null;
    if (qty === null) fail("quantity", isBlank(get("quantity")) ? "Quantity is required" : "Quantity must be a number", get("quantity"));
    else if (unit) {
      quantityKg = toKg(qty, unit);
      if (quantityKg <= 0) fail("quantity", "Quantity must be greater than zero", get("quantity"));
      else if (quantityKg > MAX_QUANTITY_KG) fail("quantity", "Quantity is unrealistically large — check the unit", get("quantity"));
    }

    let recycledKg: number | null = null;
    if (!isBlank(get("recycled_content"))) {
      const rc = parseNumber(get("recycled_content"));
      if (rc === null) fail("recycled_content", "Recycled content must be a number", get("recycled_content"));
      else if (unit) {
        recycledKg = toKg(rc, unit);
        if (quantityKg !== null && recycledKg > quantityKg) {
          fail("recycled_content", "Recycled content cannot exceed the quantity", get("recycled_content"));
        }
      }
    }

    const preConsumer = parseBoolean(get("pre_consumer"));
    if (preConsumer === null) fail("pre_consumer", "Use yes or no", get("pre_consumer"));

    const notes = isBlank(get("notes")) ? null : String(get("notes")).trim().slice(0, 500);

    // Duplicate within the file
    if (errors.length === 0 && month && category && entityType && stateCode) {
      const key = [monthKey(month), category.id, entityType, stateCode, brand?.id, plant?.id, gst?.id].join("|");
      const first = seen.get(key);
      if (first) fail("month", `Duplicate of row ${first} (same month, category, state, brand and plant)`);
      else seen.set(key, row);
    }

    if (errors.length) {
      result.errors.push(...errors);
      continue;
    }

    result.valid.push({
      row,
      data: {
        periodMonth: `${monthKey(month!)}-01`,
        financialYear: financialYearOf(month!),
        categoryId: category!.id,
        entityType: entityType!,
        stateCode: stateCode!,
        brandId: brand?.id ?? null,
        plantId: plant?.id ?? null,
        gstRegistrationId: gst?.id ?? null,
        quantityKg: kgString(quantityKg!),
        recycledContentKg: recycledKg === null ? null : kgString(recycledKg),
        isPreConsumer: preConsumer!,
        notes,
      },
    });
  }

  return result;
}

/** Rows that failed, with an "errors" column appended — for the "download error rows" CSV. */
export function errorRowsForDownload(rows: Record<string, unknown>[], errors: RowError[]) {
  const byRow = new Map<number, string[]>();
  for (const e of errors) byRow.set(e.row, [...(byRow.get(e.row) ?? []), `${e.column}: ${e.message}`]);
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, messages]) => ({ ...rows[row - 2], errors: messages.join("; ") }));
}
