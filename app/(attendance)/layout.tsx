import { redirect } from "next/navigation";
import { AccessDeniedError, getSession, requireAccess } from "@/lib/auth-server";
import { headers } from "next/headers";
import { ClipboardList, LogOut } from "lucide-react";
import { auth } from "@/lib/auth";

export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ATTENDANCE"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/");
  }

  // Only redirect to device terminal when the user is a dedicated device login account
  // (i.e. their role is DEVICE). Human operators / attendance officers who happen to
  // be assigned as device managers should not be auto-redirected away from this page.
  if (access.deviceLoginProfile && access.membershipRole === "DEVICE") {
    redirect(access.deviceLoginProfile.terminalPath);
  }

  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  async function handleSignOut() {
    "use server";
    const headersList = await headers();
    await auth.api.signOut({
      headers: {
        cookie: headersList.get("cookie") || "",
      },
    });
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/70 via-amber-50/40 to-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-orange-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="container mx-auto min-h-16 px-4 py-3 flex flex-col gap-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-orange-600" />
            <h1 className="text-lg sm:text-xl font-bold text-orange-700">Attendance Officer</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-orange-900/70 truncate max-w-40 sm:max-w-none">{session.user.name}</span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-sm text-orange-700 hover:text-orange-900 flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
