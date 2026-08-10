import { getTenantContext } from "@/lib/auth/tenant-context";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Perfil" };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, role } = await getTenantContext(tenantSlug);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Perfil de Usuario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualiza tu información y administra tu contraseña de acceso.
        </p>
      </header>

      <ProfileForm 
        email={user.email!}
        fullName={user.fullName}
        role={role}
      />
    </div>
  );
}
