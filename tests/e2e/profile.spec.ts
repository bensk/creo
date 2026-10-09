import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

async function openCami(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("cami mart");
  await page.getByRole("option", { name: /Cami Martinez/ }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
}

test("the profile shows the preferred name, groups, and family contacts", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await openCami(page);
  await expect(page.getByRole("heading", { level: 1, name: "Cami Martinez" })).toBeVisible();
  await expect(page.getByText("grade 7 · syracuse")).toBeVisible();
  const contacts = page.locator("section", { has: page.getByRole("heading", { name: "Family contacts" }) });
  await expect(contacts.getByText("Rosa Martínez")).toBeVisible();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Groups" }) }).getByText("Syracuse")).toBeVisible();
});

test("teachers don't see restricted identifiers; ops does", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await openCami(page);
  await expect(page.getByRole("heading", { name: "Identifiers" })).toHaveCount(0);
  await expect(page.getByText(/^999\d{6}$/)).toHaveCount(0);

  await signInAs(page, /^Ops/);
  await openCami(page);
  await expect(page.getByRole("heading", { name: "Identifiers" })).toBeVisible();
  await expect(page.getByText(/^999\d{6}$/)).toBeVisible();
});

test("an unknown or malformed student id is a 404", async ({ page }) => {
  await signInAs(page, /^Leader/);
  expect((await page.goto("/students/not-a-uuid"))?.status()).toBe(404);
  expect((await page.goto("/students/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
});
