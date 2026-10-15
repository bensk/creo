"use client";

import { useRouter } from "next/navigation";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";

export function NewTrackerShortcut() {
  const router = useRouter();
  useShortcut({ keys: "n", description: "New tracker", group: "This screen", run: () => router.push("/trackers/new") });
  return null;
}
