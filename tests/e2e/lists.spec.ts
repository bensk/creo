import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

test("a teacher saves a filtered grid as a list and shares it with a colleague", async ({ page }) => {
  const name = `Cami search ${Date.now() % 100000}`;
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await page.goto("/students");
  await page.getByLabel("Search students").fill("cami mart");
  await expect(page.getByText(/^\d+ students?$/)).toHaveText("1 student");
  await page.getByRole("button", { name: "Save as list" }).click();
  await page.getByLabel("list name").fill(name);
  await page.getByRole("button", { name: "Save list" }).click();
  await page.waitForURL(/\/lists\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("link", { name: /Cami Martinez/ })).toBeVisible();

  await page.getByLabel("Person", { exact: true }).selectOption({ label: "Tanisha Morgan" });
  await page.getByLabel("Access", { exact: true }).selectOption("view");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Tanisha Morgan" })).toContainText("can view");
  const url = page.url();

  await signInAs(page, /^Teacher \+ 7th grade team lead/);
  await page.goto("/lists");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.goto(url);
  await expect(page.getByText("view only")).toBeVisible();
  await expect(page.getByText("Rename or archive")).toHaveCount(0);
});

test("a list nobody shared is not found", async ({ page }) => {
  await signInAs(page, /^Coach/);
  expect((await page.goto("/lists/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
});
