import { redirect } from "next/navigation";
import {
  AccessDeniedError,
  isDeviceTypeAllowedForTerminal,
  requireAccess,
} from "@/lib/auth-server";

export const metadata = {
  title: "certe — Library Kiosk",
  description: "Student self-service library terminal",
};

export default async function LibraryKioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR", "DEVICE"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  if (
    access.deviceLoginProfile &&
    !isDeviceTypeAllowedForTerminal(access.deviceLoginProfile.deviceType, ["LIBRARY"])
  ) {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
