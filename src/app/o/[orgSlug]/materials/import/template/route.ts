import ExcelJS from "exceljs";
import { loadMaterialContext } from "@/features/materials/queries";
import { getOrgContext } from "@/lib/auth/session";
import { monthKey, startOfMonth } from "@/lib/domain/financial-year";
import { TEMPLATE_HEADERS } from "@/lib/domain/materials/import";
import { toSafeCsv } from "@/lib/files/spreadsheet";

const ENTITY_LABELS: Record<string, string> = { PRODUCER: "Producer", IMPORTER: "Importer", BRAND_OWNER: "Brand Owner" };

/** Downloadable import template pre-filled with two example rows using the org's own data. */
export async function GET(request: Request, { params }: RouteContext<"/o/[orgSlug]/materials/import/template">) {
  const { orgSlug } = await params;
  const { db, org } = await getOrgContext(orgSlug);
  const ctx = await loadMaterialContext(db, org);

  const prev = new Date();
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const month = monthKey(startOfMonth(prev));
  const entity = ENTITY_LABELS[org.entityTypes[0]] ?? "Brand Owner";
  const state = ctx.gstins[0]?.stateCode ?? org.headOfficeState ?? "MH";
  const examples = [
    { month, category: "Cat I", entity_type: entity, state, quantity: "1250.5", unit: "kg", brand: ctx.brands[0]?.name ?? "", plant: ctx.plants[0]?.name ?? "", gstin: ctx.gstins[0]?.gstin ?? "", recycled_content: "", pre_consumer: "no", notes: "Example row — delete before uploading" },
    { month, category: "Cat II", entity_type: entity, state, quantity: "3.2", unit: "tonne", brand: ctx.brands[1]?.name ?? ctx.brands[0]?.name ?? "", plant: "", gstin: "", recycled_content: "0.5", pre_consumer: "no", notes: "" },
  ];

  const format = new URL(request.url).searchParams.get("format");
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Materials");
    sheet.columns = TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: h === "notes" ? 40 : 18 }));
    sheet.getRow(1).font = { bold: true };
    examples.forEach((e) => sheet.addRow(e));
    const help = wb.addWorksheet("Help");
    help.addRows([
      ["Column", "Required", "Accepted values"],
      ["month", "Yes", "2025-07, Jul 2025 or a date"],
      ["category", "Yes", ctx.categories.map((c) => c.name.split(" – ")[0]).join(", ")],
      ["entity_type", org.entityTypes.length > 1 ? "Yes" : "No", org.entityTypes.map((t) => ENTITY_LABELS[t]).join(", ")],
      ["state", "Yes*", "State code (MH) or name — *or give a GSTIN / plant"],
      ["quantity", "Yes", "Number greater than zero"],
      ["unit", "No", "kg (default) or tonne"],
      ["brand / plant / gstin", "No", "Must already exist in EPRFlow"],
      ["recycled_content", "No", "Same unit as quantity"],
      ["pre_consumer", "No", "yes / no"],
    ]);
    help.getRow(1).font = { bold: true };
    help.columns.forEach((c) => (c.width = 40));
    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="eprflow-materials-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(toSafeCsv(examples, TEMPLATE_HEADERS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="eprflow-materials-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
