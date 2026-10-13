import { and, eq, gte, lte } from "drizzle-orm";
import {
  enrolledStudentsInGrade, findStudentByOsis, linkStudentAccount, studentByGoogleEmail, studentGoogleEmail,
} from "../../modules/students/imports";
import type { Db } from "../db/types";
import { importContext } from "../imports/context";
import { schoolYears } from "../school/schema";
import { graduationYearOf, isStudentOrgUnit, type Directory, type DirectoryUser } from "./directory";

// Links student Google accounts (everyone in /students) to student records,
// so students can sign in. Order of evidence:
//   1. The account's Employee ID holds the student's OSIS → exact match.
//   2. Otherwise the graduation-year sub-OU gives the grade, and the Google
//      first and last name must match exactly one currently enrolled student
//      in that grade (accents, case, hyphens, and spaces ignored; preferred or
//      legal first name).
//   3. Anything else (no match, two candidates, a student already linked to a
//      different account) is left unlinked and counted for ops. Never guessed.

export interface StudentAccountSummary {
  accounts: number;
  alreadyLinked: number;
  linkedByOsis: number;
  linkedByName: number;
  unmatched: number;
  ambiguous: number;
  conflicts: number;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

export async function linkStudentAccounts(
  db: Db,
  directory: Directory,
  options: { schoolId: string; actorUserId: string; today: string },
): Promise<StudentAccountSummary> {
  const ctx = importContext(db, options.schoolId, options.actorUserId, options.today);
  const summary: StudentAccountSummary = { accounts: 0, alreadyLinked: 0, linkedByOsis: 0, linkedByName: 0, unmatched: 0, ambiguous: 0, conflicts: 0 };

  const [year] = await db
    .select({ endsOn: schoolYears.endsOn })
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, options.schoolId), lte(schoolYears.startsOn, options.today), gte(schoolYears.endsOn, options.today)));
  if (!year) return summary;
  // 8th graders graduate in the June that ends this school year.
  const eighthGradeClass = Number(year.endsOn.slice(0, 4));

  const accounts = (await directory.listUsers()).filter((u) => isStudentOrgUnit(u.orgUnitPath) && !u.suspended);
  const rosterCache = new Map<number, Awaited<ReturnType<typeof enrolledStudentsInGrade>>>();

  const link = async (studentId: string, account: DirectoryUser, how: "linkedByOsis" | "linkedByName") => {
    const existing = await studentGoogleEmail(ctx, studentId);
    if (existing && existing !== account.email) {
      summary.conflicts++;
      return;
    }
    await linkStudentAccount(ctx, studentId, account.email, `${account.givenName} ${account.familyName}`.trim());
    summary[how]++;
  };

  for (const account of accounts) {
    summary.accounts++;
    if (await studentByGoogleEmail(ctx, account.email)) {
      summary.alreadyLinked++;
      continue;
    }

    if (account.employeeId && /^\d{9}$/.test(account.employeeId)) {
      const byOsis = await findStudentByOsis(ctx, account.employeeId);
      if (byOsis) {
        await link(byOsis, account, "linkedByOsis");
        continue;
      }
    }

    const gradYear = graduationYearOf(account.orgUnitPath);
    const grade = gradYear ? 8 - (gradYear - eighthGradeClass) : null;
    if (!grade || grade < 5 || grade > 8) {
      summary.unmatched++;
      continue;
    }
    if (!rosterCache.has(grade)) rosterCache.set(grade, await enrolledStudentsInGrade(ctx, grade));
    const given = norm(account.givenName);
    const family = norm(account.familyName);
    const candidates = rosterCache.get(grade)!.filter(
      (s) =>
        (norm(s.legalFirstName) === given || norm(s.preferredFirstName) === given) &&
        (norm(s.legalLastName) === family || norm(s.preferredLastName) === family),
    );
    if (candidates.length === 1) await link(candidates[0]!.id, account, "linkedByName");
    else if (candidates.length === 0) summary.unmatched++;
    else summary.ambiguous++;
  }
  return summary;
}
