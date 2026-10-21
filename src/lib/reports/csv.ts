import "server-only";
import type { CellValue, ColumnKind, ReportDocument } from "@/lib/domain/reports/types";
import { toSafeCsv } from "@/lib/files/spreadsheet";

function csvValue(value: CellValue | undefined, kind: ColumnKind): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && kind === "tonnes") return (value / 1000).toFixed(3);
  return value;
}

/** CSV of the report's main table (registers have exactly one); headers use the column labels. */
export function renderCsv(doc: ReportDocument): string {
  const section = doc.sections.find((s) => s.layout !== "fields") ?? doc.sections[0];
  const headers = section.columns.map((c) => c.label);
  const rows = section.rows.map((row) => Object.fromEntries(section.columns.map((c) => [c.label, csvValue(row[c.key], c.kind)])));
  // UTF-8 BOM so Excel shows ₹ and non-ASCII names correctly.
  return `﻿${toSafeCsv(rows, headers)}`;
}
