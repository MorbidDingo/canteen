"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useSession } from "@/lib/auth-client";

function ThemeEnforcer() {
  const { data: session } = useSession();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    if (!session?.user) return;

    // Force light mode for non-parent/non-general roles
    const isParentOrGeneral = session.user.role === "PARENT" || session.user.role === "GENERAL";

    if (!isParentOrGeneral && theme !== "light") {
      setTheme("light");
    }
  }, [session?.user, theme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeEnforcer />
      {children}
    </NextThemesProvider>
  );
}
