import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { destinationBySlug } from "@/core/ui/destinations";

// Stands in for parts of the staff app that haven't shipped yet, so every
// go-to shortcut lands somewhere honest. A module's own page replaces it.
export default async function NotYetBuilt({ params }: { params: Promise<{ section: string }> }) {
  const viewer = await requireViewer("staff");
  const { section } = await params;
  const destination = destinationBySlug(section);
  if (!destination?.arrivesIn) notFound();
  if (destination.permission && !(await can(getDb(), viewer, destination.permission))) notFound();

  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-3xl font-bold tracking-tight">{destination.label}</h1>
      <p className="text-lg">{destination.summary}</p>
      <p className="voice text-ink-muted">arrives in {destination.arrivesIn.toLowerCase()}.</p>
    </div>
  );
}
