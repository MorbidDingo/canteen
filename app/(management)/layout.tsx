import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { ManagementNav } from "./management-nav";

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

  return (
    <div className="min-h-screen bg-linear-to-b from-[#1a3a8f]/5 to-background">
      <ManagementNav />
      {children}
    </div>
  );
}
