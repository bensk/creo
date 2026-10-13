import type { Db } from "@/core/db/types";
import { DESTINATIONS } from "@/core/ui/destinations";
import { countEnrolled } from "../students/queries";

// Link previews for SIS URLs posted in Slack. Anyone in the channel sees them,
// so they show the kind of page and its title only, never student details.
// A student profile link says "Student profile", without the name.

export interface Unfurl {
  title: string;
  detail?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function unfurlFor(db: Db, schoolId: string, rawUrl: string, appUrl: string): Promise<Unfurl | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(appUrl).origin) return null;
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length === 0) return { title: "Creo SIS" };
  if (parts[0] === "students") {
    if (parts.length === 1) return { title: "Students", detail: `${await countEnrolled(db, schoolId)} enrolled students` };
    if (parts.length === 2 && parts[1] === "fields") return { title: "Student fields" };
    if (parts.length === 2 && UUID.test(parts[1]!)) return { title: "Student profile" };
    return null;
  }
  if (parts.length === 1) {
    const place = DESTINATIONS.find((d) => d.slug === parts[0]);
    if (place) return { title: place.label };
  }
  return null;
}
