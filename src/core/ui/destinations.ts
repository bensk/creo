// Places in the staff app. The order is the sidebar order. A destination whose
// module hasn't shipped yet shows a short "arrives in Phase N" page, so every
// go-to shortcut in CLAUDE.md works from day one. When a module ships its page,
// that page replaces the placeholder.

export interface Destination {
  slug: string;
  label: string;
  href: string;
  /** g then this key. */
  goKey?: string;
  /** Hidden unless the viewer has this permission. Omitted: every staff member. */
  permission?: string;
  /** Set while the module that owns it hasn't shipped. */
  arrivesIn?: string;
  /** One line for the placeholder page. */
  summary: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { slug: "", label: "Home", href: "/", summary: "Your groups and your day." },
  { slug: "students", label: "Students", href: "/students", goKey: "s", permission: "students.view", summary: "Search, profiles, and the student grid." },
  { slug: "groups", label: "Groups", href: "/groups", permission: "cohorts.view", summary: "Homerooms, grade teams, classes, and other groups." },
  { slug: "attendance", label: "Attendance", href: "/attendance", goKey: "a", arrivesIn: "Phase 3", summary: "Daily homeroom attendance, by keyboard or touch." },
  { slug: "behavior", label: "Behavior", href: "/behavior", goKey: "b", arrivesIn: "Phase 4", summary: "Behavior events, points, and restorative follow-ups." },
  { slug: "communication", label: "Communication", href: "/communication", goKey: "c", arrivesIn: "Phase 4", summary: "Calls, texts, emails, and meetings with families." },
  { slug: "trackers", label: "Trackers", href: "/trackers", goKey: "t", arrivesIn: "Phase 2", summary: "Trip eligibility, interventions, and other trackers, without a spreadsheet." },
  { slug: "dashboards", label: "Dashboards", href: "/dashboards", goKey: "d", arrivesIn: "Phase 6", summary: "Live dashboards built from the same data." },
  { slug: "lists", label: "Lists", href: "/lists", goKey: "l", summary: "Saved and live lists of students." },
  { slug: "change-log", label: "Change log", href: "/change-log", permission: "core.audit.read", summary: "Every change, who made it, and when." },
  { slug: "imports", label: "Imports", href: "/imports", permission: "integrations.run_imports", summary: "Upload Clever roster files and see past imports." },
  { slug: "slack", label: "Slack", href: "/slack", permission: "slack.manage", summary: "Where Slack notifications go, and at what detail." },
  { slug: "settings", label: "Settings", href: "/settings", permission: "core.roles.manage", arrivesIn: "Phase 0, step 13", summary: "Roles and the Google Group to role mapping." },
];

export function destinationBySlug(slug: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.slug === slug);
}
