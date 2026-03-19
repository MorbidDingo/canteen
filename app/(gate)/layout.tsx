import { redirect } from "next/navigation";
import {
  AccessDeniedError,
  isDeviceTypeAllowedForTerminal,
  requireAccess,
} from "@/lib/auth-server";

export const metadata = {
  title: "certe — Gate",
  description: "Student entry/exit gate verification",
};

export default async function GateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "ATTENDANCE", "DEVICE"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  if (
    access.deviceLoginProfile &&
    !isDeviceTypeAllowedForTerminal(access.deviceLoginProfile.deviceType, ["GATE"])
  ) {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
