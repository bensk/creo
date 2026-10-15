import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}
const weekend = () => [0, 6].includes(new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay());

test("a homeroom teacher takes attendance by keyboard in seconds", async ({ page }) => {
  test.skip(weekend(), "no attendance on weekends");
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await page.waitForURL("/attendance");
  await expect(page.getByRole("heading", { name: "Syracuse" })).toBeVisible();
  const students = page.getByRole("list", { name: "Students" }).getByRole("listitem");
  const count = await students.count();
  expect(count).toBeGreaterThan(10);

  // Until the page is ready a key press is lost, so retry; each try re-selects
  // the first student, so repeating it is harmless.
  const started = Date.now();
  await expect(async () => {
    await students.first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("a");
    await expect(students.first()).toContainText("absent", { timeout: 1000 });
  }).toPass();
  await page.keyboard.press("t");
  await page.keyboard.press("Shift+P");
  await expect(page.getByText(`${count} of ${count} marked`)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(students.nth(1)).toContainText("tardy");

  // Saved: still there after a reload. Then put the first student back to present.
  await expect(page.getByText("all saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${count} of ${count} marked`)).toBeVisible();
  await expect(students.first()).toContainText("absent");
  await students.first().getByRole("button", { name: "P", exact: true }).click();
  await expect(students.first()).toContainText("present");
});

test("ops see which homerooms haven't finished; coaches can't open attendance", async ({ page }) => {
  await signInAs(page, /^Ops/);
  await page.goto("/attendance");
  await expect(page.getByRole("heading", { name: "Attendance", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Syracuse" })).toBeVisible();
  await signInAs(page, /^Coach/);
  expect((await page.goto("/attendance"))?.status()).toBe(404);
});

test("ops sign a student in late by typing a name and pressing Enter", async ({ page }) => {
  test.skip(weekend(), "no attendance on weekends");
  await signInAs(page, /^Ops/);
  await page.goto("/attendance");
  await page.getByRole("link", { name: "Late arrivals" }).click();
  const find = page.getByLabel("Find a student who arrived late");
  await find.fill("mateo mart");
  await expect(page.getByRole("button", { name: "Sign in late" }).first()).toBeVisible();
  await find.press("Enter");
  const signedIn = page.getByRole("status").filter({ hasText: "Signed in Mateo." });
  const already = page.getByRole("alert").filter({ hasText: "already signed in today" });
  await expect(signedIn.or(already)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Mateo Martinez" })).toBeVisible();
});
