import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  for (const [path, signIn] of [
    ["/", "/sign-in"],
    ["/students", "/sign-in"],
    ["/student", "/student/sign-in"],
    ["/family", "/family/sign-in"],
  ] as const) {
    test(`${path} redirects to ${signIn}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(signIn);
    });
  }

  test("a forged cookie is not a session", async ({ page, context }) => {
    await context.addCookies([{ name: "creo_staff_session", value: "forged", url: "http://localhost:3000" }]);
    await page.goto("/");
    await expect(page).toHaveURL("/sign-in");
  });
});
