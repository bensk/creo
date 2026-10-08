import { expect, test, type Page } from "@playwright/test";

// Signs in through the dev sign-in page as seeded test users (pnpm db:seed).

/** Clicks a test user and waits until the sign-in finishes (landing page or refusal). */
async function signInAs(page: Page, label: string | RegExp, landsOn: string | RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(landsOn);
}

/** The page's own alert, not Next's route announcer (which also has role=alert). */
const alertIn = (page: Page) => page.getByRole("main").getByRole("alert");
const REFUSED = /\/dev\/sign-in\?refused=/;

test("staff: a teacher lands in the staff app with their role", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/, "/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("complementary").getByText("Jordan Reyes")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("teacher", { exact: true })).toBeVisible();
});

test("staff: a person with two roles gets both", async ({ page }) => {
  await signInAs(page, /^Teacher \+ support/, "/");
  await expect(page.getByRole("complementary").getByText("support · teacher")).toBeVisible();
});

test("student: lands in the student portal, not the staff app", async ({ page }) => {
  await signInAs(page, /^Student/, "/student");
  await expect(page.getByRole("heading", { name: "Hi, Cami Martinez" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL("/sign-in");
});

test("family: Spanish-speaking parent sees two children in Spanish", async ({ page }) => {
  await signInAs(page, /^Family \(Spanish, two children\)/, "/family");
  await expect(page.getByText("Puede ver la información de 2 estudiantes.")).toBeVisible();
});

test("staff with no role is refused", async ({ page }) => {
  await signInAs(page, /^Staff with no role/, REFUSED);
  await expect(alertIn(page)).toContainText("no current access");
  await page.goto("/");
  await expect(page).toHaveURL("/sign-in");
});

test("family contact without portal access is refused", async ({ page }) => {
  await signInAs(page, /^Family contact without portal access/, REFUSED);
  await expect(alertIn(page)).toContainText("don't have portal access");
});

test("sign out ends the session", async ({ page }) => {
  await signInAs(page, /^Leader/, "/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await page.goto("/");
  await expect(page).toHaveURL("/sign-in");
});

test("one browser can hold staff, student, and family sessions at once", async ({ page }) => {
  await signInAs(page, /^Ops/, "/");
  await signInAs(page, /^Student/, "/student");
  await signInAs(page, /^Family \(Spanish/, "/family");
  await page.goto("/");
  await expect(page.getByRole("complementary").getByText("Yesenia Cruz")).toBeVisible();
  await page.goto("/student");
  await expect(page.getByRole("heading", { name: "Hi, Cami Martinez" })).toBeVisible();
});
