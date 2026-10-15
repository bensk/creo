import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

test("a teacher tracks their homeroom, ticks a box by keyboard, shares it, and downloads it", async ({ page }) => {
  const name = `Field trip ${Date.now() % 100000}`;
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await page.goto("/groups");
  await page.getByRole("link", { name: "Syracuse" }).first().click();
  await page.getByRole("link", { name: "Track these students" }).click();
  await expect(page.getByText(/^\d+ students$/)).toBeVisible();
  await page.getByRole("button", { name: "Next: name and columns" }).click();
  await page.getByPlaceholder("e.g. DC Trip 2027").fill(name);
  await page.getByLabel("Column 1 name").fill("Permission slip");
  await page.getByRole("button", { name: "Create tracker" }).click();
  await page.waitForURL(/\/trackers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // Name (220) then Grade (70), after the 44 px row numbers: the first Permission slip cell.
  const grid = page.getByTestId("tracker-grid");
  await expect(async () => {
    const box = (await grid.boundingBox())!;
    await page.mouse.click(box.x + 44 + 220 + 35, box.y + 52);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    await expect(page.getByText("Saved “Permission slip”.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  await page.getByLabel("Person", { exact: true }).selectOption({ label: "Tanisha Morgan" });
  await page.getByLabel("Access", { exact: true }).selectOption("edit");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Tanisha Morgan" })).toContainText("can edit");

  const download = await page.request.get(`${page.url()}/export`);
  expect(download.headers()["content-type"]).toContain("text/csv");
  const csv = await download.text();
  expect(csv.split("\r\n")[0]).toBe("Name,Grade,Permission slip");
  expect(csv).toContain(",Yes");

  const url = page.url();
  await signInAs(page, /^Teacher \+ 7th grade team lead/);
  await page.goto("/trackers");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Add a column" })).toBeVisible();
});

test("trackers nobody shared are not found", async ({ page }) => {
  await signInAs(page, /^Coach/);
  expect((await page.goto("/trackers/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
});
