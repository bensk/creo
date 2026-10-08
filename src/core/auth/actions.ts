"use server";

import { redirect } from "next/navigation";
import { signOut } from "./server";
import { SURFACES, type Surface } from "./surfaces";

const surfaces = new Set<Surface>(["staff", "student", "family"]);

export async function signOutAction(formData: FormData): Promise<void> {
  const surface = formData.get("surface");
  if (typeof surface !== "string" || !surfaces.has(surface as Surface)) return;
  await signOut(surface as Surface);
  redirect(SURFACES[surface as Surface].signIn);
}
