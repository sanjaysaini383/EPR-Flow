import "server-only";
import ExcelJS from "exceljs";
import { formatCell, type ColumnKind, type ReportDocument } from "@/lib/domain/reports/types";

const NUM_FMT: Partial<Record<ColumnKind, string>> = {
  tonnes: "#,##0.000",
  percent: '0.##"%"',
  inr: '"₹" #,##,##0',
  number: "#,##0.##",
  date: "dd-mmm-yyyy",
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F3EC" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };

/** Excel value for a cell: tonnes columns hold kg and are converted; strings are always written as text. */
function excelValue(value: unknown, kind: ColumnKind): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return kind === "tonnes" ? Math.round(value) / 1000 : value;
  // ExcelJS writes plain strings as text (never formulas), so "=..." cannot execute.
  return String(value);
}

/**
 * One worksheet per section, plus a cover sheet. Numbers stay numeric (with
 * number formats) so the file can be summed and filtered in Excel.
 */
export async function renderXlsx(doc: ReportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EPRFlow";
  wb.created = doc.generatedAt;

  const cover = wb.addWorksheet("Cover");
  cover.columns = [{ width: 28 }, { width: 90 }];
  cover.addRow([doc.title]).font = { bold: true, size: 16 };
  cover.addRow([doc.organizationName]).font = { bold: true, size: 12 };
  cover.addRow([doc.subtitle]);
  cover.addRow(["Generated", formatCell(doc.generatedAt, "date")]);
  cover.addRow([]);
  cover.addRow(["Sections"]).font = { bold: true };
  doc.sections.forEach((s) => cover.addRow(["", s.title]));
  if (doc.disclaimer) {
    cover.addRow([]);
    const row = cover.addRow(["Note", doc.disclaimer]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.height = 48;
  }

  const usedNames = new Set<string>(["Cover"]);
  for (const section of doc.sections) {
    let name = section.title.replace(/^\d+\.\s*/, "").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Sheet";
    for (let i = 2; usedNames.has(name); i++) name = `${name.slice(0, 28)} ${i}`;
    usedNames.add(name);
    const sheet = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: section.note ? 3 : 2 }] });

    sheet.addRow([section.title]).font = TITLE_FONT;
    if (section.note) sheet.addRow([section.note]).font = { italic: true, color: { argb: "FF555555" } };

    const header = sheet.addRow(section.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.alignment = { wrapText: true, vertical: "middle" };
    });

    for (const row of section.rows) {
      const r = sheet.addRow(section.columns.map((c) => excelValue(row[c.key], c.kind)));
      section.columns.forEach((c, i) => {
        const fmt = NUM_FMT[c.kind];
        if (fmt) r.getCell(i + 1).numFmt = fmt;
      });
    }
    if (section.rows.length === 0) sheet.addRow(["No records."]).font = { italic: true };
    if (section.totals) {
      const totals = section.totals;
      const r = sheet.addRow(section.columns.map((c) => excelValue(totals[c.key], c.kind)));
      r.font = { bold: true };
      section.columns.forEach((c, i) => {
        const fmt = NUM_FMT[c.kind];
        if (fmt) r.getCell(i + 1).numFmt = fmt;
        r.getCell(i + 1).border = { top: { style: "thin" } };
      });
    }
    section.columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width ?? (c.kind === "text" ? 20 : 16);
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
