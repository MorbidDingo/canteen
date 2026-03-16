"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  GraduationCap,
  Upload,
  CreditCard,
  UtensilsCrossed,
  BarChart3,
  ScrollText,
  BookOpen,
  ChevronRight,
} from "lucide-react";

const groups = [
  {
    title: "Organisational",
    items: [
      { href: "/management/parents", label: "Parents", icon: Users },
      { href: "/management/students", label: "Students", icon: GraduationCap },
      { href: "/management/bulk-upload", label: "Bulk Uploads", icon: Upload },
      { href: "/management/cards", label: "RFID Cards", icon: CreditCard },
    ],
  },
  {
    title: "Canteen",
    items: [
      { href: "/admin/orders", label: "Admin Orders", icon: UtensilsCrossed },
      { href: "/management/statistics", label: "Management Statistics", icon: BarChart3 },
      { href: "/management/attendance", label: "Attendance Statistics", icon: BarChart3 },
      { href: "/management/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/management/library/books", label: "Books", icon: BookOpen },
      { href: "/management/library/bulk-upload", label: "Bulk Upload", icon: Upload },
      { href: "/management/library/statistics", label: "Statistics", icon: BarChart3 },
    ],
  },
];

export default function ManagementHomePage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Management Home</h1>
        <p className="text-sm text-muted-foreground">
          Quick access to grouped management functions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {label}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
