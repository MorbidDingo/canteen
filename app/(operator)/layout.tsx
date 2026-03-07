import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "OPERATOR") {
    redirect("/");
  }

  return <>{children}</>;
}
