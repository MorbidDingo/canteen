"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
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
  IoNotifications,
  IoCalendar,
  IoSunny,
} from "react-icons/io5";

const groups = [
  {
    title: "Organisation",
    items: [
      { href: "/management/accounts", label: "Accounts", desc: "Roles & access", icon: IoShieldCheckmark, color: "text-amber-600", bg: "bg-amber-50" },
      { href: "/management/device-accounts", label: "Device Accounts", desc: "Terminal devices", icon: IoDesktop, color: "text-slate-600", bg: "bg-slate-50" },
      { href: "/management/parents", label: "Parents", desc: "Parent accounts", icon: IoPeople, color: "text-blue-600", bg: "bg-blue-50" },
      { href: "/management/students", label: "Students", desc: "Student records", icon: IoSchool, color: "text-emerald-600", bg: "bg-emerald-50" },
      { href: "/management/bulk-upload", label: "Bulk Uploads", desc: "Import data", icon: IoCloudUpload, color: "text-violet-600", bg: "bg-violet-50" },
      { href: "/management/cards", label: "RFID Cards", desc: "Card management", icon: IoCard, color: "text-orange-600", bg: "bg-orange-50" },
    ],
  },
  {
    title: "Academic Calendar",
    items: [
      { href: "/management/notifications", label: "Notices", desc: "Send notices & reminders", icon: IoNotifications, color: "text-pink-600", bg: "bg-pink-50" },
      { href: "/management/exams", label: "Exams", desc: "Schedule & notify exams", icon: IoSchool, color: "text-indigo-600", bg: "bg-indigo-50" },
      { href: "/management/holidays", label: "Holidays", desc: "School holidays & closures", icon: IoSunny, color: "text-emerald-600", bg: "bg-emerald-50" },
    ],
  },
  {
    title: "Canteen",
    items: [
      { href: "/admin/orders", label: "Admin Orders", desc: "Live order queue", icon: IoRestaurant, color: "text-rose-600", bg: "bg-rose-50" },
      { href: "/management/payment-events", label: "Payment Events", desc: "Approve accounts & view events", icon: IoCalendar, color: "text-green-600", bg: "bg-green-50" },
      { href: "/management/statistics", label: "Statistics", desc: "Management metrics", icon: IoBarChart, color: "text-cyan-600", bg: "bg-cyan-50" },
      { href: "/management/attendance", label: "Attendance", desc: "Attendance data", icon: IoFingerPrint, color: "text-teal-600", bg: "bg-teal-50" },
      { href: "/management/audit", label: "Audit Log", desc: "Activity trail", icon: IoReader, color: "text-stone-600", bg: "bg-stone-50" },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/management/library/books", label: "Books", desc: "Catalogue & inventory", icon: IoBook, color: "text-indigo-600", bg: "bg-indigo-50" },
      { href: "/management/library/bulk-upload", label: "Bulk Upload", desc: "Import books", icon: IoCloudUpload, color: "text-purple-600", bg: "bg-purple-50" },
      { href: "/management/library/statistics", label: "Statistics", desc: "Library metrics", icon: IoBarChart, color: "text-sky-600", bg: "bg-sky-50" },
    ],
  },
];

export default function ManagementHomePage() {
  const { data: session } = useSession();
  const userName = session?.user?.name;
  const firstName = userName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-8 md:max-w-3xl">
      {/* Welcome Header */}
      <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white/80 px-5 py-4 shadow-sm backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-0.5">Management Portal</p>
        <h1 className="text-2xl font-bold tracking-tight text-amber-950">
          {firstName ? `Hello, ${firstName} 👋` : "Management"}
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
              {group.items.map(({ href, label, desc, icon: Icon, color, bg }, idx) => (
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
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", bg, color)}>
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
