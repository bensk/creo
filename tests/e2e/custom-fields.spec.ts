import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}
const count = (page: Page) => page.getByText(/^\d+ students?$/);

test("a leader adds a field, bulk-sets it for two students, and filters by it", async ({ page }) => {
  const name = `Trip group ${Date.now() % 100000}`;
  await signInAs(page, /^Leader/);
  await page.goto("/students/fields");
  await page.getByPlaceholder("e.g. Dismissal").fill(name);
  await page.locator("select").first().selectOption("select");
  await page.getByPlaceholder("Parent pickup, Self-dismiss").fill("Bus A, Bus B");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText(`Added “${name}”. It's now a column in the student grid.`)).toBeVisible();

  await page.goto("/students");
  await expect(count(page)).toHaveText("397 students");
  await page.waitForTimeout(300);
  // Tick the first two rows' checkboxes. The toolbar can grow once a row is
  // ticked, so find the grid again before each click.
  const tick = async (row: number) => {
    const box = (await page.getByTestId("student-grid").boundingBox())!;
    await page.mouse.click(box.x + 16, box.y + 36 + 17 + row * 34);
  };
  await tick(0);
  await expect(page.getByRole("button", { name: "Edit 1 selected" })).toBeVisible();
  await tick(1);
  await page.getByRole("button", { name: "Edit 2 selected" }).click();
  await page.getByLabel("field").selectOption({ label: name });
  await page.getByLabel("new value (empty clears it)").selectOption("Bus A");
  await page.getByRole("button", { name: "Apply to 2" }).click();
  await expect(page.getByText(`Saved “${name}” for 2 students.`)).toBeVisible();

  await page.getByRole("button", { name: /^Filter/ }).click();
  await page.getByLabel("field").selectOption({ label: name });
  await page.getByLabel("value").selectOption("Bus A");
  await page.getByRole("button", { name: "Add filter" }).click();
  await expect(count(page)).toHaveText("2 students");

  // Clean up: archive the field.
  await page.goto("/students/fields");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "Edit" }).click();
  // In edit mode the label is in an input; only one row is edited at a time.
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(`Archived “${name}”. Its values are kept.`)).toBeVisible();
});

test("teachers can't open the fields page", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  expect((await page.goto("/students/fields"))?.status()).toBe(404);
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Fields" })).toHaveCount(0);
});
