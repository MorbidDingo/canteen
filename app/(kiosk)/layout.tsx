import { redirect } from "next/navigation";
import {
  AccessDeniedError,
  isDeviceTypeAllowedForTerminal,
  requireAccess,
} from "@/lib/auth-server";

export const metadata = {
  title: "certe — Kiosk",
  description: "Student self-ordering kiosk",
};

export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "DEVICE"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  if (
    access.deviceLoginProfile &&
    !isDeviceTypeAllowedForTerminal(access.deviceLoginProfile.deviceType, ["KIOSK"])
  ) {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
