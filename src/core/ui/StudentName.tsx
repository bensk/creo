// The one way to show a student's name (CLAUDE.md, "Names matter"): preferred
// name everywhere. Pronunciation (phonetic spelling and a play button) slots in
// here in Phase 1, so every roster, header, and search result gets it at once.

export interface StudentNameParts {
  legalFirstName: string;
  legalLastName: string;
  preferredFirstName?: string | null;
  preferredLastName?: string | null;
}

export function displayName(s: StudentNameParts): string {
  return `${s.preferredFirstName || s.legalFirstName} ${s.preferredLastName || s.legalLastName}`;
}

export function StudentName({ student, className = "" }: { student: StudentNameParts; className?: string }) {
  return <span className={className}>{displayName(student)}</span>;
}
