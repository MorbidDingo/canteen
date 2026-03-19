import { redirect } from "next/navigation";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN"],
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

  return <>{children}</>;
}
