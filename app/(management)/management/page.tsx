"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  IoShieldCheckmark,
  IoDesktop,
  IoPeople,
  IoSchool,
  IoCloudUpload,
  IoCard,
  IoRestaurant,
  IoBarChart,
  IoReader,
  IoBook,
  IoChevronForward,
  IoFingerPrint,
} from "react-icons/io5";

const groups = [
  {
    title: "Organisation",
    items: [
      { href: "/management/accounts", label: "Accounts", desc: "Roles & access", icon: IoShieldCheckmark, color: "text-amber-600" },
      { href: "/management/device-accounts", label: "Device Accounts", desc: "Terminal devices", icon: IoDesktop, color: "text-slate-600" },
      { href: "/management/parents", label: "Parents", desc: "Parent accounts", icon: IoPeople, color: "text-blue-600" },
      { href: "/management/students", label: "Students", desc: "Student records", icon: IoSchool, color: "text-emerald-600" },
      { href: "/management/bulk-upload", label: "Bulk Uploads", desc: "Import data", icon: IoCloudUpload, color: "text-violet-600" },
      { href: "/management/cards", label: "RFID Cards", desc: "Card management", icon: IoCard, color: "text-orange-600" },
    ],
  },
  {
    title: "Canteen",
    items: [
      { href: "/admin/orders", label: "Admin Orders", desc: "Live order queue", icon: IoRestaurant, color: "text-rose-600" },
      { href: "/management/statistics", label: "Statistics", desc: "Management metrics", icon: IoBarChart, color: "text-cyan-600" },
      { href: "/management/attendance", label: "Attendance", desc: "Attendance data", icon: IoFingerPrint, color: "text-teal-600" },
      { href: "/management/audit", label: "Audit Log", desc: "Activity trail", icon: IoReader, color: "text-stone-600" },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/management/library/books", label: "Books", desc: "Catalogue & inventory", icon: IoBook, color: "text-indigo-600" },
      { href: "/management/library/bulk-upload", label: "Bulk Upload", desc: "Import books", icon: IoCloudUpload, color: "text-purple-600" },
      { href: "/management/library/statistics", label: "Statistics", desc: "Library metrics", icon: IoBarChart, color: "text-sky-600" },
    ],
  },
];

export default function ManagementHomePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-8 md:max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-amber-950">
          Management
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Quick access to all management tools.
        </p>
      </div>

      <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              {group.title}
            </h2>
            <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur">
              {group.items.map(({ href, label, desc, icon: Icon, color }, idx) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-amber-50/60 active:bg-amber-100/50",
                    idx !== group.items.length - 1 && "border-b border-amber-100/80",
                    idx === 0 && "rounded-t-2xl",
                    idx === group.items.length - 1 && "rounded-b-2xl",
                  )}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50", color)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                  <IoChevronForward className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
