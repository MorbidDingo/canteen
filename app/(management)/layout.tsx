import { redirect } from "next/navigation";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { ManagementNav } from "./management-nav";

export default async function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  if (access.deviceLoginProfile) {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/50 to-background">
      <ManagementNav />
      <main className="px-3 py-4 lg:pl-72 lg:pr-6 lg:py-6">
        {children}
      </main>
    </div>
  );
}
