import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class SpreadsheetError extends Error {}

export type ParsedSheet = { headers: string[]; rows: Record<string, unknown>[]; sha256: string };

/**
 * Reads the first sheet of a CSV or XLSX upload into header-keyed rows.
 * Formulas resolve to their cached result; nothing in the file is ever executed.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new SpreadsheetError("The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new SpreadsheetError("The file is larger than 5 MB — split it into smaller files");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  if (name.endsWith(".csv")) return { ...parseCsv(buffer.toString("utf8")), sha256 };
  if (name.endsWith(".xlsx")) {
    // XLSX is a ZIP archive: check the magic bytes so renamed files are rejected early.
    if (buffer.subarray(0, 4).toString("hex") !== "504b0304") throw new SpreadsheetError("This is not a valid .xlsx file");
    return { ...(await parseXlsx(buffer)), sha256 };
  }
  if (name.endsWith(".xls")) throw new SpreadsheetError("Old .xls files are not supported — save as .xlsx or .csv");
  throw new SpreadsheetError("Upload a .csv or .xlsx file");
}

function parseCsv(text: string) {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const fatal = result.errors.find((e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter");
  if (fatal) throw new SpreadsheetError("Could not read the CSV — make sure it is comma-separated");
  return { headers: (result.meta.fields ?? []).filter(Boolean), rows: result.data };
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue); // formula
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return value.text; // hyperlink
    if ("error" in value) return "";
  }
  return value;
}

async function parseXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError("Could not open the Excel file — is it password-protected or corrupted?");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetError("The Excel file has no sheets");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cellValue(cell.value) ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const record: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) record[h] = cellValue(row.getCell(i + 1).value);
    });
    rows.push(record);
  }
  return { headers: headers.filter(Boolean), rows };
}

/** CSV output that is safe to open in Excel (neutralises =, +, -, @ formula injection). */
export function toSafeCsv(rows: Record<string, unknown>[], headers: string[]) {
  const safe = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  return Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => safe(r[h]))) });
}
