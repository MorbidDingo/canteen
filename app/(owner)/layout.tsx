import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { organizationMembership } from "@/lib/db/schema";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [ownerMembership] = await db
    .select({ id: organizationMembership.id })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!ownerMembership) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-amber-50/40 to-background">
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
