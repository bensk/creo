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

test("pronunciation shows in search results and the profile header", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("cami mart");
  await expect(page.getByRole("option", { name: /Cami Martinez/ })).toContainText("kah-MEE-lah");
  await page.getByRole("option", { name: /Cami Martinez/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("kah-MEE-lah");
});

test("supports show only to staff who may see them for that student", async ({ page }) => {
  const openMateo = async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("mateo martinez");
    await page.getByRole("option", { name: /Mateo Martinez/ }).click();
    await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
  };
  // Mateo (5th grade) isn't in the Syracuse teacher's groups.
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await openMateo();
  await expect(page.getByRole("heading", { name: "Supports" })).toHaveCount(0);

  await signInAs(page, /^Support \(counselor\)/);
  await openMateo();
  await expect(page.getByRole("heading", { name: "Supports" })).toBeVisible();
  await expect(page.getByText("English learner")).toBeVisible();
});

test("every staff member sees the medical alert; only some see health and demographics", async ({ page }) => {
  const open = async (query: string, name: RegExp) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type(query);
    await page.getByRole("option", { name }).click();
    await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
  };
  // Mateo (5th grade) isn't the Syracuse teacher's student.
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await open("mateo martinez", /Mateo Martinez/);
  await expect(page.getByRole("note")).toContainText("Severe peanut allergy");
  await expect(page.getByRole("heading", { name: "Health" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demographics" })).toHaveCount(0);

  await signInAs(page, /^Support \(counselor\)/);
  await open("mateo martinez", /Mateo Martinez/);
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Health" }) })).toContainText("EpiPen");

  await signInAs(page, /^Ops/);
  await open("cami mart", /Cami Martinez/);
  await expect(page.getByRole("heading", { name: "Demographics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health" })).toHaveCount(0);
  await expect(page.getByText("photos: ask family first")).toBeVisible();
});
