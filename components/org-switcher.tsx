"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Membership = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  role: string;
  status: string;
};

export function OrgSwitcher() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [membershipsRes, activeRes] = await Promise.all([
          fetch("/api/org/memberships", { cache: "no-store" }),
          fetch("/api/org/active", { cache: "no-store" }),
        ]);

        if (!membershipsRes.ok || !activeRes.ok) {
          return;
        }

        const membershipsData = (await membershipsRes.json()) as { memberships: Membership[] };
        const activeData = (await activeRes.json()) as { activeOrganizationId: string | null };

        if (!mounted) return;

        setMemberships(membershipsData.memberships || []);

        const fallback = membershipsData.memberships?.[0]?.organizationId || "";
        const resolvedActiveOrganizationId = activeData.activeOrganizationId || fallback;
        setActiveOrganizationId(resolvedActiveOrganizationId);

        if (!activeData.activeOrganizationId && resolvedActiveOrganizationId) {
          await fetch("/api/org/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId: resolvedActiveOrganizationId }),
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSelect(nextOrganizationId: string) {
    if (!nextOrganizationId || nextOrganizationId === activeOrganizationId) return;

    setActiveOrganizationId(nextOrganizationId);
    await fetch("/api/org/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: nextOrganizationId }),
    });

    router.refresh();
  }

  if (loading || memberships.length <= 1) return null;

  return (
    <Select value={activeOrganizationId} onValueChange={handleSelect}>
      <SelectTrigger className="h-8 w-[220px]">
        <SelectValue placeholder="Select organization" />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.membershipId} value={m.organizationId}>
            {m.organizationName} ({m.role})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
