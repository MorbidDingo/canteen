import { redirect } from "next/navigation";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  // Only redirect to device terminal for dedicated device-login accounts (DEVICE role).
  // Human operators assigned to devices should not be auto-redirected.
  if (access.deviceLoginProfile && access.membershipRole === "DEVICE") {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  return <>{children}</>;
}
