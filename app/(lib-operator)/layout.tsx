import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { LibOperatorNav } from "./lib-operator-nav";

export default async function LibOperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "LIB_OPERATOR") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-[#d4891a]/5 to-background">
      <LibOperatorNav />
      {children}
    </div>
  );
}
