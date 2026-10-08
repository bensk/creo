import { expect, test, type Page } from "@playwright/test";

// The staff shell and portals (Phase 0 exit: a staff member signs in, sees their
// role-appropriate shell, and every shortcut in CLAUDE.md works).

async function signInAs(page: Page, label: RegExp, landsOn: string) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(landsOn);
}
const TEACHER = /^Teacher \(7th grade, Syracuse homeroom\)/;

test.describe("staff shell", () => {
  test("⌘K finds a student by preferred name and opens them", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await page.keyboard.type("cami mart");
    const cami = palette.getByRole("option", { name: /Cami Martinez/ });
    await expect(cami).toContainText("grade 7 · Syracuse");
    await cami.click();
    await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  });

  test("g then a letter goes to each place", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    for (const [key, path, heading] of [
      ["s", "/students", "Students"], ["a", "/attendance", "Attendance"], ["b", "/behavior", "Behavior"],
      ["c", "/communication", "Communication"], ["t", "/trackers", "Trackers"], ["d", "/dashboards", "Dashboards"],
      ["l", "/lists", "Lists"],
    ] as const) {
      await page.keyboard.press("g");
      await page.keyboard.press(key);
      await page.waitForURL(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("? shows every registered shortcut and Esc closes it", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet).toBeVisible();
    for (const text of ["Search students, places, and actions", "Search on this screen", "Go to Trackers", "Next group", "Close, cancel, or clear selection"]) {
      await expect(sheet.getByText(text)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("j and k move through your groups, Enter opens one", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    const rows = page.getByRole("link", { name: /students$/ });
    await page.keyboard.press("j");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("k");
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/students\?group=/);
  });

  test("/ opens the palette when a screen has no search of its own", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the theme choice applies immediately and survives a reload", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("radio", { name: "dark" }).click(),
    ]);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the sidebar follows roles: leaders get the change log, admins get settings", async ({ page }) => {
    await signInAs(page, TEACHER, "/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Change log" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    expect((await page.goto("/change-log"))?.status()).toBe(404);

    await signInAs(page, /^Leader/, "/");
    await nav.getByRole("link", { name: "Change log" }).click();
    await expect(page.getByRole("cell", { name: "Signed in" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await signInAs(page, /^Admin/, "/");
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});

test.describe("portals", () => {
  test("a Spanish-speaking family sees Spanish and can switch to English", async ({ page }) => {
    await signInAs(page, /^Family \(Spanish/, "/family");
    await expect(page.getByRole("heading", { name: "Hola, Rosa Martínez" })).toBeVisible();
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Rosa Martínez" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the student sign-in page switches language", async ({ page }) => {
    await page.goto("/student/sign-in");
    await page.getByRole("button", { name: "Español" }).click();
    await expect(page.getByRole("heading", { name: "Inicio de sesión para estudiantes" })).toBeVisible();
  });
});
