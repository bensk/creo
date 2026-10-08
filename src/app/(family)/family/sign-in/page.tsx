import { DevSignInLink } from "@/core/auth/DevSignInLink";

export default function FamilySignIn() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold text-brand-charcoal">Creo family portal · Portal para familias</h1>
      <p className="mt-3">Families will sign in with a code sent by email. This is not set up yet.</p>
      <p className="mt-1" lang="es">
        Las familias iniciarán sesión con un código enviado por correo electrónico. Todavía no está disponible.
      </p>
      <DevSignInLink />
    </main>
  );
}
