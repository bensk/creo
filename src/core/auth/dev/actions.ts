"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../../db/client";
import { users } from "../../identity/schema";
import { ALL_PERSONAS, personaEmail } from "../../seed/personas";
import { signIn } from "../server";
import { SignInRefused } from "../session";
import { SURFACES } from "../surfaces";
import { devSignInStatus } from "./guard";

/** Signs in as a seeded test user. Re-checks every guard: server actions can be called directly. */
export async function devSignInAction(formData: FormData): Promise<void> {
  const status = await devSignInStatus();
  if (!status.allowed) notFound();

  const persona = ALL_PERSONAS.find((p) => p.key === formData.get("persona"));
  if (!persona) notFound();

  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, personaEmail(persona)));
  if (!user) redirect(`/dev/sign-in?refused=${persona.key}&reason=no_user`);

  try {
    await signIn(user.id, persona.kind, "dev");
  } catch (error) {
    if (error instanceof SignInRefused) redirect(`/dev/sign-in?refused=${persona.key}&reason=${error.reason}`);
    throw error;
  }
  redirect(SURFACES[persona.kind].home);
}
