import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}
const TEACHER = /^Teacher \(7th grade, Syracuse homeroom\)/;
const count = (page: Page) => page.getByText(/^\d+ students?$/);

test("g s opens the grid of currently enrolled students", async ({ page }) => {
  await signInAs(page, TEACHER);
  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await page.waitForURL("/students");
  await expect(count(page)).toHaveText("397 students");
  await expect(page.getByText("Enrollment is active")).toBeVisible();
  await expect(page.getByTestId("student-grid")).toBeVisible();
});

test("/ focuses search, and search narrows the grid", async ({ page }) => {
  await signInAs(page, TEACHER);
  await page.goto("/students");
  await expect(count(page)).toHaveText("397 students");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search students")).toBeFocused();
  await page.keyboard.type("cami mart");
  await expect(count(page)).toHaveText("1 student");
});

test("filters by homeroom and removes the filter", async ({ page }) => {
  await signInAs(page, TEACHER);
  await page.goto("/students");
  await page.getByRole("button", { name: /^Filter/ }).click();
  await page.getByLabel("field").selectOption({ label: "Homeroom" });
  await page.getByLabel("value").fill("Syracuse");
  await page.getByRole("button", { name: "Add filter" }).click();
  await expect(page.getByText("Homeroom is Syracuse")).toBeVisible();
  await expect(count(page)).not.toHaveText("397 students");
  const filtered = Number((await count(page).textContent())?.split(" ")[0]);
  expect(filtered).toBeGreaterThan(20);
  expect(filtered).toBeLessThan(30);
  await page.getByRole("button", { name: "Remove filter: Homeroom is Syracuse" }).click();
  await expect(count(page)).toHaveText("397 students");
});

test("teachers can't filter on supports, and IEP is marked as their students only", async ({ page }) => {
  await signInAs(page, TEACHER);
  await page.goto("/students");
  await page.getByRole("button", { name: /^Filter/ }).click();
  await expect(page.getByLabel("field").locator("option", { hasText: "IEP" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Columns/ }).click();
  await expect(page.getByRole("checkbox", { name: /IEP your students/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /OSIS/ })).toHaveCount(0);
});

test("saves a view and applies it later", async ({ page }) => {
  const name = `Acevedos ${Date.now()}`;
  await signInAs(page, TEACHER);
  await page.goto("/students");
  await page.getByLabel("Search students").fill("acevedo");
  await expect(count(page)).not.toHaveText("397 students");
  const narrowed = await count(page).textContent();
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByLabel("save current view as").fill(name);
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByText(`Saved view “${name}”.`)).toBeVisible();

  await page.reload();
  await expect(count(page)).toHaveText("397 students");
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(count(page)).toHaveText(narrowed!);
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("button", { name: `Delete view ${name}` }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
});

/** Shows Cami's pronouns in the grid and edits them from the keyboard. */
async function editCamiPronouns(page: Page, value: string) {
  await page.goto("/students");
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.getByRole("checkbox", { name: "Pronouns" }).check();
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.getByLabel("Search students").fill("cami mart");
  await expect(count(page)).toHaveText("1 student");
  await page.waitForTimeout(300); // the canvas redraws just after the count updates

  // Name, Pronunciation, Pronouns: click Name in the first row, then move right twice.
  const box = (await page.getByTestId("student-grid").boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + 52);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const editor = page.locator("#portal textarea, #portal input").first();
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved “Pronouns”.")).toBeVisible();
}

test("a homeroom teacher edits a pronoun from the keyboard, and it saves", async ({ page }) => {
  await signInAs(page, TEACHER);
  // A value unique to this run, so the edit is a real change even if an earlier run stopped halfway.
  await editCamiPronouns(page, `she/they ${Date.now() % 100000}`);
  // Put it back so other tests see the seed value.
  await editCamiPronouns(page, "she/her");
});
