"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, UserCheck, UserX, AlertTriangle } from "lucide-react";

type AttendanceDashboardResponse = {
  date: string;
  summary: {
    totalStudents: number;
    currentlyInside: number;
    currentlyOutside: number;
    insidePercentage: number;
  };
  classWiseBreakdown: Array<{
    className: string;
    inside: number;
    outside: number;
    total: number;
    attendancePercentage: number;
  }>;
  anomalies: Array<{
    childName: string;
    direction: "ENTRY" | "EXIT";
    tappedAt: string;
    reason: string | null;
  }>;
};

export default function ManagementAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AttendanceDashboardResponse | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/management/attendance-dashboard?date=${date}`);
        if (!res.ok) return;
        const payload = await res.json();
        if (active) setData(payload);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [date]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Statistics</h1>
          <p className="text-sm text-muted-foreground">
            Live attendance and class-wise presence overview.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="attendance-date" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Failed to load attendance data.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Students</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-2xl font-bold">{data.summary.totalStudents}</span>
                <Users className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Inside</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-2xl font-bold text-emerald-600">
                  {data.summary.currentlyInside}
                </span>
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outside</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-2xl font-bold text-amber-600">
                  {data.summary.currentlyOutside}
                </span>
                <UserX className="h-5 w-5 text-amber-600" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Inside %</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {data.summary.insidePercentage}%
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Class-wise Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.classWiseBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No class data.</p>
                ) : (
                  data.classWiseBreakdown.map((row) => (
                    <div
                      key={row.className}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{row.className}</span>
                      <span className="text-muted-foreground">
                        {row.inside}/{row.total} inside ({row.attendancePercentage}%)
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Recent Anomalies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.anomalies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No anomalies detected.</p>
                ) : (
                  data.anomalies.map((row, idx) => (
                    <div key={`${row.childName}-${idx}`} className="rounded-md border px-3 py-2 text-xs">
                      <p className="font-medium">{row.childName}</p>
                      <p className="text-muted-foreground">
                        {row.direction} · {new Date(row.tappedAt).toLocaleTimeString()}
                      </p>
                      {row.reason && <p className="text-amber-700">{row.reason}</p>}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
