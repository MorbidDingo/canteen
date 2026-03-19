"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrgSwitcher } from "@/components/org-switcher";
import { signOut } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, LogOut, RefreshCw } from "lucide-react";

type Organization = {
  id: string;
  name: string;
  slug: string;
  type: "SCHOOL" | "COLLEGE" | "OTHER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  contactEmail: string | null;
  contactPhone: string | null;
  suspensionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function OwnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<"SCHOOL" | "COLLEGE" | "OTHER">("SCHOOL");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const activeCount = useMemo(
    () => organizations.filter((org) => org.status === "ACTIVE").length,
    [organizations],
  );
  const suspendedCount = useMemo(
    () => organizations.filter((org) => org.status === "SUSPENDED").length,
    [organizations],
  );

  async function loadData() {
    setLoading(true);
    try {
      const orgRes = await fetch("/api/owner/organizations", { cache: "no-store" });
      if (!orgRes.ok) {
        throw new Error("Failed to load owner dashboard data");
      }

      const orgData = (await orgRes.json()) as { organizations: Organization[] };
      setOrganizations(orgData.organizations ?? []);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load owner dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createOrganization(e: FormEvent) {
    e.preventDefault();

    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/owner/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          type,
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create organization");
      }

      toast.success("Organization created");
      setName("");
      setSlug("");
      setType("SCHOOL");
      setContactEmail("");
      setContactPhone("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  async function editOrganization(org: Organization) {
    const nextName = window.prompt("Organization name", org.name);
    if (nextName == null) return;

    const nextSlug = window.prompt("Organization slug", org.slug);
    if (nextSlug == null) return;

    const nextEmail = window.prompt("Contact email (optional)", org.contactEmail ?? "");
    if (nextEmail == null) return;

    const nextPhone = window.prompt("Contact phone (optional)", org.contactPhone ?? "");
    if (nextPhone == null) return;

    const res = await fetch(`/api/owner/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        slug: nextSlug,
        contactEmail: nextEmail,
        contactPhone: nextPhone,
      }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to update organization");
      return;
    }

    toast.success("Organization updated");
    await loadData();
  }

  async function disableOrganization(org: Organization) {
    const reason = window.prompt("Disable reason", "Disabled by organization owner") || "Disabled by organization owner";
    const res = await fetch(`/api/owner/organizations/${org.id}/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to disable organization");
      return;
    }

    toast.success("Organization disabled");
    await loadData();
  }

  async function requestReactivation(org: Organization) {
    const reason =
      window.prompt("Reason for reactivation request", "Please reactivate this organization") ||
      "Please reactivate this organization";

    const res = await fetch(`/api/owner/organizations/${org.id}/reactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = (await res.json().catch(() => null)) as
      | { error?: string; message?: string; alreadyPending?: boolean }
      | null;

    if (!res.ok) {
      toast.error(data?.error || "Failed to send reactivation request");
      return;
    }

    toast.success(data?.message || "Reactivation request sent");
  }

  function handleSignOut() {
    signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-white/70 p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Organization Owner Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage all your organizations from one login.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrgSwitcher />
          <Button asChild variant="outline">
            <Link href="/management">Open Management</Link>
          </Button>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Organizations</CardTitle>
            <CardDescription>All organizations under your account</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{organizations.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active</CardTitle>
            <CardDescription>Organizations currently operational</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{activeCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Suspended</CardTitle>
            <CardDescription>Organizations requiring platform action</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{suspendedCount}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Organization</CardTitle>
          <CardDescription>Create a new organization under your owner account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createOrganization} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northfield School" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="northfield-school" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as "SCHOOL" | "COLLEGE" | "OTHER")}>
                <SelectTrigger id="org-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL">School</SelectItem>
                  <SelectItem value="COLLEGE">College</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact Email (optional)</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="office@northfield.edu"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="contact-phone">Contact Phone (optional)</Label>
              <Input
                id="contact-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving || loading}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>Edit details or disable/reactivate owned organizations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations found.</p>
          ) : (
            organizations.map((org) => (
              <div key={org.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">{org.slug} • {org.type}</p>
                  {org.suspensionReason ? (
                    <p className="text-xs text-destructive">{org.suspensionReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={org.status === "ACTIVE" ? "default" : org.status === "SUSPENDED" ? "destructive" : "secondary"}>
                    {org.status}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => void editOrganization(org)}>
                    Edit
                  </Button>
                  {org.status === "ACTIVE" ? (
                    <Button size="sm" variant="destructive" onClick={() => void disableOrganization(org)}>
                      Disable
                    </Button>
                  ) : org.status === "SUSPENDED" ? (
                    <Button size="sm" variant="outline" onClick={() => void requestReactivation(org)}>
                      Request Reactivation
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
