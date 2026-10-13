import { expect, test, type Page } from "@playwright/test";

// A fake microphone, so recording works headless.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["microphone"],
});

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

async function openCami(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Camila Martinez");
  await expect(page.getByRole("option", { name: /Cami Martinez/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
}

test("a leader records how a name is said, and staff can play it", async ({ page }) => {
  await signInAs(page, /^Leader/);
  await openCami(page);
  await page.getByRole("button", { name: /(Edit|Add) pronunciation/ }).click();
  await page.getByPlaceholder("e.g. kah-MEE-lah").fill("kah-MEE-lah");
  await page.getByRole("button", { name: /Record/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByLabel("New recording")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved pronunciation." })).toBeVisible();

  // Playing fetches the recording through the permission-checked route.
  const play = page.getByRole("button", { name: "Play how to say Cami Martinez" }).first();
  const audio = page.waitForResponse((r) => /\/api\/pronunciations\/[0-9a-f-]{36}\/audio$/.test(r.url()));
  await play.click();
  const res = await audio;
  expect([200, 206]).toContain(res.status());
  expect(res.headers()["content-type"]).toMatch(/^audio\//);
  expect(res.headers()["cache-control"]).toContain("private");
});

test("the recording isn't reachable without a staff session", async ({ request }) => {
  const res = await request.get("/api/pronunciations/00000000-0000-4000-8000-000000000000/audio", { maxRedirects: 0 });
  expect([302, 303, 307, 308, 401, 404]).toContain(res.status());
  expect(res.headers()["content-type"] ?? "").not.toContain("audio");
});
