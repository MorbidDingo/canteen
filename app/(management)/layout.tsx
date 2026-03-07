import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";

export default async function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "MANAGEMENT") {
    redirect("/");
  }

  return <>{children}</>;
}
