import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, label: RegExp) {
  await page.goto("/dev/sign-in");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL("/");
}

// Synthetic Clever files: header rows as Schoolrunner sends them, invented students with 999… OSIS.
function cleverFiles(osis: string) {
  const file = (name: string, lines: string[]) => ({ name: `${name}.csv`, mimeType: "text/csv", buffer: Buffer.from(lines.join("\n")) });
  return [
    file("schools", ["School_id,School_name,School_number,State_id,Low_grade,High_grade,Principal,Principal_email,School_address,School_city,School_state,School_zip,School_phone", "S1,Creo College Prep,84X612,,5,8,,,,,,,"]),
    file("students", [
      "School_id,Student_id,Student_number,State_id,Last_name,Middle_name,First_name,Grade,Gender,Dob,Race,Hispanic_Latino,Ell_status,Frl_status,Iep_status,Student_street,Student_city,Student_state,Student_zip,Student_email,Contact_relationship,Contact_type,Contact_name,Contact_phone,Contact_email,Username,Password",
      `S1,E2E-1,,${osis},Uploadtest,,Nia,6,F,03/03/2015,B,N,N,,N,,,,,,Mother,Guardian,Dora Uploadtest,7185550177,,,`,
    ]),
    file("teachers", ["School_id,Teacher_id,Teacher_number,State_teacher_id,Last_name,Middle_name,First_name,Teacher_email,Title,Username,Password", "S1,T1,,,Reyes,,Jordan,jordan.reyes@creoprep.org,,,"]),
    file("staff", ["School_id,Staff_id,Staff_email,First_name,Last_name,Department,Title,Username,Password,Role"]),
    file("sections", ["School_id,Section_id,Teacher_id,Teacher_2_id,Teacher_3_id,Teacher_4_id,Name,Section_number,Grade,Course_name,Course_number,Course_description,Period,Subject,Term_name,Term_start,Term_end", "S1,E2E-SEC,T1,,,,Science 6 - Period 4,,6,Science 6,SCI6,,4,Science,,,"]),
    file("enrollments", ["School_id,Section_id,Student_id", "S1,E2E-SEC,E2E-1"]),
  ];
}

test("ops previews a Clever upload without saving anything", async ({ page }) => {
  await signInAs(page, /^Ops/);
  await page.getByRole("link", { name: "Imports" }).click();
  await page.getByLabel("Clever files to upload").setInputFiles(cleverFiles("999888001"));
  await page.getByRole("button", { name: "Preview changes" }).click();
  const status = page.getByRole("status").filter({ hasText: "Nothing is saved yet" });
  await expect(status).toBeVisible();
  await expect(status).toContainText(/New students\s*1/);
  await expect(status).toContainText(/New classes\s*1/);
  await expect(page.getByRole("button", { name: "Import these changes" })).toBeVisible();
});

test("a synthetic database refuses files with real OSIS numbers", async ({ page }) => {
  await signInAs(page, /^Admin/);
  await page.goto("/imports");
  await page.getByLabel("Clever files to upload").setInputFiles(cleverFiles("212345678"));
  await page.getByRole("button", { name: "Preview changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "synthetic data only" })).toBeVisible();
});

test("missing files are named", async ({ page }) => {
  await signInAs(page, /^Admin/);
  await page.goto("/imports");
  await page.getByLabel("Clever files to upload").setInputFiles(cleverFiles("999888002").slice(0, 2));
  await page.getByRole("button", { name: "Preview changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Missing: teachers.csv, staff.csv, sections.csv, enrollments.csv" })).toBeVisible();
});

test("teachers can't open Imports", async ({ page }) => {
  await signInAs(page, /^Teacher \(7th grade, Syracuse homeroom\)/);
  expect((await page.goto("/imports"))?.status()).toBe(404);
});

test("ops preview a Schoolrunner attendance export; real OSIS numbers are refused here", async ({ page }) => {
  const header = "Student,Student ID,SR Student Number,SIS Student Number,State ID,Grade Level,Date,Absence Type Code,Absence Type,Comments,Teammate,Homeroom,Incident Id,Absence Active";
  const file = (osis: string) => ({ name: "Daily Attendance Absence Export.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}\n"Test, Student",1,${osis},${osis},,7th,2026-10-14,P,Present,,"Reyes, Jordan",7 Room,,1\n`) });
  await signInAs(page, /^Ops/);
  await page.goto("/imports");
  const exports = page.getByLabel("Daily Attendance exports");
  await exports.setInputFiles(file("999999998"));
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nothing is saved yet" }).last()).toContainText("Rows skipped (1)");
  await exports.setInputFiles(file("212345678"));
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "synthetic data only" })).toBeVisible();
});
