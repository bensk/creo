import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

test("ops creates an intervention group and adds a student by keyboard", async ({ page }) => {
  const name = `Tier 2 Reading ${Date.now() % 100000}`;
  await signInAs(page, /^Ops/);
  await page.getByRole("link", { name: "Groups" }).click();
  await expect(page.getByRole("heading", { name: "Groups", level: 1 })).toBeVisible();
  const newGroup = page.getByPlaceholder("e.g. Tier 2 Math, grade 7");
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(newGroup).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  const find = page.getByLabel("Find a student to add");
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(find).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.type("mateo mart");
  await page.getByRole("listitem").filter({ hasText: "Mateo Martinez" }).getByRole("button", { name: "Add" }).click();
  const students = page.getByRole("region", { name: "Students" }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Students" }) }));
  await expect(students.getByRole("link", { name: /Mateo Martinez/ })).toBeVisible();

  // Archive it so repeated runs don't pile up.
  await page.getByText("Rename or archive").click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Archived" })).toBeVisible();
});

test("teachers see groups and classes but can't create groups", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await page.goto("/groups");
  await expect(page.getByRole("heading", { name: "Homerooms" })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Tier 2 Math, grade 7")).toHaveCount(0);
  await page.getByRole("link", { name: "Syracuse" }).first().click();
  await expect(page.getByText("students come from the imports")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
});
