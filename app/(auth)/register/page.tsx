"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CerteWordmark } from "@/components/certe-logo";
import { z } from "zod";

const organizationSchema = z
  .object({
    adminName: z.string().min(2, "Admin name must be at least 2 characters"),
    adminEmail: z.string().email("Please enter a valid email"),
    adminPhone: z.string().min(10, "Phone number must be at least 10 digits"),
    organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
    organizationSlug: z
      .string()
      .min(2, "Organization slug must be at least 2 characters")
      .regex(/^[a-z0-9-]+$/, "Slug can contain only lowercase letters, numbers, and hyphens"),
    organizationType: z.enum(["SCHOOL", "COLLEGE", "OTHER"]),
    adminPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmAdminPassword: z.string(),
  })
  .refine((data) => data.adminPassword === data.confirmAdminPassword, {
    message: "Passwords don't match",
    path: ["confirmAdminPassword"],
  });

const adminSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    organizationSlug: z
      .string()
      .min(2, "Organization slug must be at least 2 characters")
      .regex(/^[a-z0-9-]+$/, "Slug can contain only lowercase letters, numbers, and hyphens"),
    role: z.enum(["ADMIN", "MANAGEMENT", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE"]),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"organization" | "admin">("organization");
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [organizationForm, setOrganizationForm] = useState({
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    organizationName: "",
    organizationSlug: "",
    organizationType: "SCHOOL" as "SCHOOL" | "COLLEGE" | "OTHER",
    adminPassword: "",
    confirmAdminPassword: "",
  });
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    phone: "",
    organizationSlug: "",
    role: "ADMIN" as "ADMIN" | "MANAGEMENT" | "OPERATOR" | "LIB_OPERATOR" | "ATTENDANCE",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateOrganizationField = (field: string, value: string) => {
    setOrganizationForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const updateAdminField = (field: string, value: string) => {
    setAdminForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const applyValidationErrors = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    issues.forEach((err) => {
      if (err.path[0]) {
        fieldErrors[err.path[0] as string] = err.message;
      }
    });
    setErrors(fieldErrors);
  };

  const handleOrganizationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = organizationSchema.safeParse(organizationForm);
    if (!result.success) {
      applyValidationErrors(result.error.issues);
      return;
    }

    setLoadingOrg(true);
    const response = await fetch("/api/onboarding/register-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(organizationForm),
    });
    setLoadingOrg(false);

    const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!response.ok) {
      toast.error(data?.error || "Organization registration failed");
      return;
    }

    toast.success(data?.message || "Organization registration submitted");
    router.push("/login");
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = adminSchema.safeParse(adminForm);
    if (!result.success) {
      applyValidationErrors(result.error.issues);
      return;
    }

    setLoadingAdmin(true);
    const response = await fetch("/api/onboarding/register-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminForm),
    });
    setLoadingAdmin(false);

    const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!response.ok) {
      toast.error(data?.error || "Admin registration failed");
      return;
    }

    toast.success(data?.message || "Admin registration submitted");
    router.push("/login");
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl animate-scale-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <CerteWordmark className="text-3xl" />
          </div>
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>
            Register to start using <CerteWordmark />
          </CardDescription>
        </CardHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "organization" | "admin")}>
          <CardContent className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="organization">New Tenant</TabsTrigger>
              <TabsTrigger value="admin">Tenant Admin/Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="organization">
              <form onSubmit={handleOrganizationSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      placeholder="Springfield Public School"
                      value={organizationForm.organizationName}
                      onChange={(e) => updateOrganizationField("organizationName", e.target.value)}
                    />
                    {errors.organizationName && <p className="text-xs text-destructive">{errors.organizationName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-slug">Organization Slug</Label>
                    <Input
                      id="org-slug"
                      placeholder="springfield-public"
                      value={organizationForm.organizationSlug}
                      onChange={(e) => updateOrganizationField("organizationSlug", e.target.value.toLowerCase())}
                    />
                    {errors.organizationSlug && <p className="text-xs text-destructive">{errors.organizationSlug}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-type">Organization Type</Label>
                    <Select
                      value={organizationForm.organizationType}
                      onValueChange={(value) => updateOrganizationField("organizationType", value)}
                    >
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
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="org-admin-name">Primary Admin Name</Label>
                    <Input
                      id="org-admin-name"
                      placeholder="Principal John Doe"
                      value={organizationForm.adminName}
                      onChange={(e) => updateOrganizationField("adminName", e.target.value)}
                    />
                    {errors.adminName && <p className="text-xs text-destructive">{errors.adminName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-email">Primary Admin Email</Label>
                    <Input
                      id="org-admin-email"
                      type="email"
                      placeholder="admin@school.edu"
                      value={organizationForm.adminEmail}
                      onChange={(e) => updateOrganizationField("adminEmail", e.target.value)}
                    />
                    {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-phone">Primary Admin Phone</Label>
                    <Input
                      id="org-admin-phone"
                      type="tel"
                      placeholder="9876543210"
                      value={organizationForm.adminPhone}
                      onChange={(e) => updateOrganizationField("adminPhone", e.target.value)}
                    />
                    {errors.adminPhone && <p className="text-xs text-destructive">{errors.adminPhone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-password">Password</Label>
                    <Input
                      id="org-admin-password"
                      type="password"
                      placeholder="********"
                      value={organizationForm.adminPassword}
                      onChange={(e) => updateOrganizationField("adminPassword", e.target.value)}
                    />
                    {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-confirm">Confirm Password</Label>
                    <Input
                      id="org-admin-confirm"
                      type="password"
                      placeholder="********"
                      value={organizationForm.confirmAdminPassword}
                      onChange={(e) => updateOrganizationField("confirmAdminPassword", e.target.value)}
                    />
                    {errors.confirmAdminPassword && (
                      <p className="text-xs text-destructive">{errors.confirmAdminPassword}</p>
                    )}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loadingOrg}>
                  {loadingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Tenant Registration
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="admin">
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="admin-name">Full Name</Label>
                    <Input
                      id="admin-name"
                      placeholder="Aisha Khan"
                      value={adminForm.name}
                      onChange={(e) => updateAdminField("name", e.target.value)}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="aisha@school.edu"
                      value={adminForm.email}
                      onChange={(e) => updateAdminField("email", e.target.value)}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-phone">Phone Number</Label>
                    <Input
                      id="admin-phone"
                      type="tel"
                      placeholder="9876543210"
                      value={adminForm.phone}
                      onChange={(e) => updateAdminField("phone", e.target.value)}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-org">Organization Slug</Label>
                    <Input
                      id="admin-org"
                      placeholder="springfield-public"
                      value={adminForm.organizationSlug}
                      onChange={(e) => updateAdminField("organizationSlug", e.target.value.toLowerCase())}
                    />
                    {errors.organizationSlug && <p className="text-xs text-destructive">{errors.organizationSlug}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-role">Requested Role</Label>
                    <Select value={adminForm.role} onValueChange={(value) => updateAdminField("role", value)}>
                      <SelectTrigger id="admin-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MANAGEMENT">Management</SelectItem>
                        <SelectItem value="OPERATOR">Operator</SelectItem>
                        <SelectItem value="LIB_OPERATOR">Library Operator</SelectItem>
                        <SelectItem value="ATTENDANCE">Attendance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-password">Password</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="********"
                      value={adminForm.password}
                      onChange={(e) => updateAdminField("password", e.target.value)}
                    />
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-confirm">Confirm Password</Label>
                    <Input
                      id="admin-confirm"
                      type="password"
                      placeholder="********"
                      value={adminForm.confirmPassword}
                      onChange={(e) => updateAdminField("confirmPassword", e.target.value)}
                    />
                    {errors.confirmPassword && (
                      <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loadingAdmin}>
                  {loadingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Admin Registration
                </Button>
              </form>
            </TabsContent>
          </CardContent>
        </Tabs>

        <CardFooter className="flex flex-col gap-4 pt-0">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
