import { redirect } from "next/navigation";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  return <>{children}</>;
}
