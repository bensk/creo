// The one way to show a student's name (CLAUDE.md, "Names matter"): preferred
// name everywhere, with the phonetic spelling beside it wherever staff are likely
// to say the name out loud, plus a play button when there's a recording.

import { PlayNameButton } from "./PlayNameButton";

export interface StudentNameParts {
  legalFirstName: string;
  legalLastName: string;
  preferredFirstName?: string | null;
  preferredLastName?: string | null;
}

export function displayName(s: StudentNameParts): string {
  return `${s.preferredFirstName || s.legalFirstName} ${s.preferredLastName || s.legalLastName}`;
}

/** Where a pronunciation recording is served (after a permission check). */
export function pronunciationAudioUrl(pronunciationId: string): string {
  return `/api/pronunciations/${pronunciationId}/audio`;
}

export function StudentName({
  student,
  phonetic,
  audioUrl,
  className = "",
}: {
  student: StudentNameParts;
  /** Show it in rosters, the profile header, search results, and substitute views. */
  phonetic?: string | null;
  /** From pronunciationAudioUrl(); adds a play button. */
  audioUrl?: string | null;
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
      {audioUrl && <PlayNameButton src={audioUrl} name={displayName(student)} />}
    </span>
  );
}
