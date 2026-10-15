import { expect, test, type Browser, type Page } from "@playwright/test";

async function signedIn(browser: Browser, label: RegExp): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
  return page;
}

test("two people on one tracker see each other's edits without reloading", async ({ browser }) => {
  const name = `Live ${Date.now() % 100000}`;
  const owner = await signedIn(browser, /^Teacher \(7th grade, Syracuse homeroom\)/);
  await owner.goto("/trackers/new?grade=7");
  await owner.getByRole("button", { name: "Next: name and columns" }).click();
  await owner.getByPlaceholder("e.g. DC Trip 2027").fill(name);
  await owner.getByLabel("Column 1 name").fill("Paid");
  await owner.getByRole("button", { name: "Create tracker" }).click();
  await owner.waitForURL(/\/trackers\/[0-9a-f-]{36}$/);
  await owner.getByLabel("Person", { exact: true }).selectOption({ label: "Tanisha Morgan" });
  await owner.getByLabel("Access", { exact: true }).selectOption("edit");
  await owner.getByRole("button", { name: "Share" }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "Tanisha Morgan" })).toBeVisible();
  await expect(owner.getByText("live", { exact: true })).toBeVisible();

  const colleague = await signedIn(browser, /^Teacher \+ 7th grade team lead/);
  await colleague.goto(owner.url());
  await expect(colleague.getByText("live", { exact: true })).toBeVisible();
  const grid = colleague.getByTestId("tracker-grid");
  await expect(async () => {
    const box = (await grid.boundingBox())!;
    await colleague.mouse.click(box.x + 44 + 220 + 35, box.y + 52);
    await colleague.keyboard.press("ArrowRight");
    await colleague.keyboard.press(" ");
    await expect(colleague.getByText("Saved “Paid”.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  await expect(owner.getByText("Updated with someone else's change.")).toBeVisible({ timeout: 10_000 });
  const csv = await (await owner.request.get(`${owner.url()}/export`)).text();
  expect(csv).toContain(",Yes");
});
