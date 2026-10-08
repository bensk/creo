import { cookies } from "next/headers";
import { DevSwitchUser } from "@/core/auth/DevSignInLink";
import { requireViewer } from "@/core/auth/server";
import { SignOutButton } from "@/core/auth/SignOutButton";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { DESTINATIONS } from "@/core/ui/destinations";
import { StaffShell } from "@/core/ui/StaffShell";
import { parseTheme, THEME_COOKIE } from "@/core/ui/theme";
import { searchStudentsAction } from "@/modules/students/actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const destinations = [];
  for (const d of DESTINATIONS) {
    if (!d.permission || (await can(db, viewer, d.permission))) destinations.push(d);
  }
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <StaffShell
      name={viewer.displayName}
      roles={viewer.roles}
      destinations={destinations}
      searchStudents={(await can(db, viewer, "students.view")) ? searchStudentsAction : undefined}
      theme={theme}
      footerExtra={
        <div className="flex items-center justify-between gap-2">
          <SignOutButton surface="staff" />
          <DevSwitchUser />
        </div>
      }
    >
      {children}
    </StaffShell>
  );
}
