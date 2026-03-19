import { redirect } from "next/navigation";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { LibOperatorNav } from "./lib-operator-nav";

export default async function LibOperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["LIB_OPERATOR"],
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
    <div className="min-h-screen bg-linear-to-b from-[#d4891a]/5 to-background">
      <LibOperatorNav />
      {children}
    </div>
  );
}
