// The one way to show a student's name (CLAUDE.md, "Names matter"): preferred
// name everywhere, with the phonetic spelling beside it wherever staff are likely
// to say the name out loud. The audio play button joins here when recordings ship.

export interface StudentNameParts {
  legalFirstName: string;
  legalLastName: string;
  preferredFirstName?: string | null;
  preferredLastName?: string | null;
}

export function displayName(s: StudentNameParts): string {
  return `${s.preferredFirstName || s.legalFirstName} ${s.preferredLastName || s.legalLastName}`;
}

export function StudentName({
  student,
  phonetic,
  className = "",
}: {
  student: StudentNameParts;
  /** Show it in rosters, the profile header, search results, and substitute views. */
  phonetic?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {displayName(student)}
      {phonetic && (
        <span className="voice ml-[0.5em] align-middle text-[0.55em] font-normal text-ink-muted">
          <span className="sr-only">, pronounced </span>
          {phonetic}
        </span>
      )}
    </span>
  );
}
