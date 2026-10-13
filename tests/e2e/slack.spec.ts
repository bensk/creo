import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

test("a leader adds and removes a notification rule", async ({ page }) => {
  await signInAs(page, /^Leader/);
  await page.getByRole("link", { name: "Slack" }).click();
  await expect(page.getByRole("heading", { name: "Slack", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Add a rule" }).click();
  await page.getByPlaceholder("C0123456789").fill("C0E2ETEST1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved the rule." })).toBeVisible();
  const rule = page.getByRole("listitem").filter({ hasText: "channel C0E2ETEST1" });
  await expect(rule).toContainText("counts only");
  await rule.getByRole("button", { name: "Remove" }).click();
  await expect(rule).toHaveCount(0);
});

test("teachers can't open the Slack page", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  expect((await page.goto("/slack"))?.status()).toBe(404);
});

test("Slack endpoints answer 404 until Slack is configured", async ({ request }) => {
  const res = await request.post("/api/slack/commands", { form: { command: "/student", text: "cami" } });
  expect(res.status()).toBe(404);
});
