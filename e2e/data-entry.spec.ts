import { expect, test } from "@playwright/test";
import { DEMO_ORG, login, makeGstin } from "./helpers";

const BASE = `/o/${DEMO_ORG}`;
const pick = async (page: import("@playwright/test").Page, label: string, option: string) => {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

test.describe("organisation structure", () => {
  test.beforeEach(async ({ page }) => login(page, "compliance@demo.eprflow.in"));

  test("brands: add, reject duplicates, archive", async ({ page }) => {
    const name = `E2E Brand ${Date.now()}`;
    await page.goto(`${BASE}/brands`);
    await page.getByRole("button", { name: "Add brand" }).first().click();
    await page.getByLabel("Brand name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Add brand" }).click();
    await expect(page.getByRole("cell", { name })).toBeVisible();

    await page.getByRole("button", { name: "Add brand" }).first().click();
    await page.getByLabel("Brand name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Add brand" }).click();
    await expect(page.getByText("A brand with this name already exists")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) }).getByText("Archived")).toBeVisible();
  });

  test("GST: checksum and PAN must match the company", async ({ page }) => {
    await page.goto(`${BASE}/gst`);
    await page.getByRole("button", { name: "Add GSTIN" }).first().click();
    const dialog = page.getByRole("dialog");

    await page.getByLabel("GSTIN").fill("07AAACD1234F1Z0");
    await dialog.getByRole("button", { name: "Add GSTIN" }).click();
    await expect(dialog.getByText("GSTIN checksum does not match")).toBeVisible();

    await page.getByLabel("GSTIN").fill(makeGstin("07", "AAAPZ9999Q"));
    await dialog.getByRole("button", { name: "Add GSTIN" }).click();
    await expect(dialog.getByText(/belongs to PAN AAAPZ9999Q, not your organisation's PAN AAACD1234F/)).toBeVisible();
  });

  test("plants: GSTIN must be in the plant's state", async ({ page }) => {
    await page.goto(`${BASE}/plants`);
    await page.getByRole("button", { name: "Add plant" }).first().click();
    await page.getByLabel("Plant name").fill(`E2E Plant ${Date.now()}`);
    await pick(page, "State", "Karnataka");
    await page.getByRole("combobox", { name: "GSTIN" }).click();
    await page.getByRole("option", { name: /Maharashtra/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Add plant" }).click();
    await expect(page.getByText("This GSTIN is registered in Maharashtra, not Karnataka")).toBeVisible();
  });
});

test.describe("material entries", () => {
  test("manual entry with tonne conversion, duplicate guard and delete", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/materials/new`);

    const fill = async () => {
      await page.getByLabel("Month").fill("2024-06");
      await pick(page, "Category", "Category IV – Compostable plastic packaging");
      await pick(page, "Entity type", "Brand Owner");
      await pick(page, "State", "Rajasthan");
      await page.getByLabel("Quantity placed on market").fill("2.5");
      await pick(page, "Unit", "tonnes");
      await page.getByLabel("Notes").fill("e2e-test");
    };
    await fill();
    await expect(page.getByText("= 2,500 kg · 2.50 t")).toBeVisible();
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/materials$`));

    await page.goto(`${BASE}/materials?fy=2024-25&state=RJ`);
    const row = page.getByRole("row", { name: /Jun 2024.*Category IV/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("2.50 t")).toBeVisible();

    await page.goto(`${BASE}/materials/new`);
    await fill();
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByText(/An entry already exists for this month/)).toBeVisible();

    await page.goto(`${BASE}/materials?fy=2024-25&state=RJ`);
    await page.getByRole("row", { name: /Jun 2024.*Category IV/ }).getByRole("button", { name: "Entry actions" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("No entries match these filters.")).toBeVisible();
  });

  test("validation explains problems before saving", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/materials/new`);
    await page.getByLabel("Month").fill("2015-01");
    await page.getByLabel("Quantity placed on market").fill("abc");
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByText(/before April 2016/)).toBeVisible();
    await expect(page.getByText("Quantity must be a number, e.g. 1250.5")).toBeVisible();
    await expect(page.getByText("Select a category")).toBeVisible();
  });

  test("CSV import: preview errors, download error rows, import valid rows", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/materials/import`);

    const csv = [
      "Month,Category,Entity Type,State,Quantity,Unit,Notes",
      "2024-05,Cat IV,Brand Owner,RJ,1.2,tonne,e2e-test",
      "2024-05,Cat IX,Brand Owner,RJ,10,kg,e2e-test",
      "2099-01,Cat IV,Brand Owner,Goa,=HYPERLINK(1),kg,e2e-test",
    ].join("\n");
    await page.locator("input[type=file]").setInputFiles({ name: `e2e-${Date.now()}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Validate file" }).click();

    await expect(page.getByRole("heading", { name: "Review import" })).toBeVisible();
    await expect(page.getByText("Unknown category — use e.g. Cat I, Cat II, Cat III or Cat IV")).toBeVisible();
    await expect(page.getByText("Month cannot be in the future")).toBeVisible();
    await expect(page.getByText("Quantity must be a number")).toBeVisible();

    const href = await page.getByRole("link", { name: "Download error rows" }).getAttribute("href");
    const download = await page.request.get(href!);
    const body = await download.text();
    expect(body).toContain("errors");
    expect(body).toContain("'=HYPERLINK(1)"); // formula neutralised

    await page.getByRole("button", { name: "Import 1 valid row" }).click();
    await expect(page).toHaveURL(/source=IMPORT/);
    await page.goto(`${BASE}/materials?fy=2024-25&state=RJ&source=IMPORT`);
    await expect(page.getByRole("row", { name: /May 2024.*Category IV/ })).toBeVisible();
  });

  test("rejects files that are not spreadsheets", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/materials/import`);
    await page.locator("input[type=file]").setInputFiles({ name: "evil.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("not a zip") });
    await page.getByRole("button", { name: "Validate file" }).click();
    await expect(page.getByText("This is not a valid .xlsx file")).toBeVisible();
  });

  test("viewers can browse materials but not change them", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`${BASE}/materials`);
    await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add entry" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Entry actions" })).toHaveCount(0);
    await page.goto(`${BASE}/materials/new`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/materials$`));
  });
});
