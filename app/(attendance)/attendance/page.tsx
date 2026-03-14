"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Camera, Clock3, RefreshCw, ShieldAlert, Upload, Users } from "lucide-react";

type LiveTapRecord = {
  id: string;
  childId: string;
  name: string;
  grNumber: string | null;
  direction: "ENTRY" | "EXIT";
  tappedAt: string;
  image: string | null;
  presenceStatus: "INSIDE" | "OUTSIDE";
  isValid?: boolean;
  anomalyReason?: string | null;
};

type SummaryStats = {
  totalStudents: number;
  insideCount: number;
  outsideCount: number;
  totalTapEvents: number;
  tapsLast24h: number;
  anomalyCount: number;
  overstayCount: number;
};

const defaultStats: SummaryStats = {
  totalStudents: 0,
  insideCount: 0,
  outsideCount: 0,
  totalTapEvents: 0,
  tapsLast24h: 0,
  anomalyCount: 0,
  overstayCount: 0,
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

export default function AttendancePage() {
  const [recent, setRecent] = useState<LiveTapRecord[]>([]);
  const [latest, setLatest] = useState<LiveTapRecord | null>(null);
  const [latestVisible, setLatestVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>(defaultStats);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const latestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecent = async () => {
    try {
      const res = await fetch("/api/attendance/recent?limit=3", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch recent taps");
      const data = await res.json();
      setRecent(data.records || []);
    } catch {
      toast.error("Failed to load live attendance feed");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/attendance/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      const data = await res.json();
      setStats(data.stats || defaultStats);
    } catch {
      // Keep dashboard usable even if summary fails.
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchRecent(), fetchSummary()]);
    setRefreshing(false);
  };

  const showLatestForThreeSeconds = (record: LiveTapRecord) => {
    setLatest(record);
    setLatestVisible(true);

    if (latestTimerRef.current) {
      clearTimeout(latestTimerRef.current);
    }

    latestTimerRef.current = setTimeout(() => {
      setLatestVisible(false);
    }, 3000);
  };

  useEffect(() => {
    fetchRecent();
    fetchSummary();

    const poll = setInterval(() => {
      fetchRecent();
      fetchSummary();
    }, 20000);

    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "gate-tap" || !data.payload) return;

        const record = data.payload as LiveTapRecord;
        showLatestForThreeSeconds(record);

        setRecent((prev) => {
          const merged = [record, ...prev.filter((r) => r.id !== record.id)];
          return merged.slice(0, 3);
        });

        fetchSummary();
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      clearInterval(poll);
      eventSource.close();
      if (latestTimerRef.current) {
        clearTimeout(latestTimerRef.current);
      }
    };
  }, []);

  const sortedRecent = useMemo(() => {
    return [...recent].sort(
      (a, b) => new Date(b.tappedAt).getTime() - new Date(a.tappedAt).getTime(),
    );
  }, [recent]);

  const uploadStudentPhoto = async (childId: string, file: File) => {
    try {
      setUploadingFor(childId);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("childId", childId);

      const res = await fetch("/api/photos/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Photo upload failed");
        return;
      }

      toast.success("Student photo uploaded");
      await fetchRecent();
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploadingFor(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-orange-950">Attendance Live Feed</h1>
            <p className="mt-1 text-sm sm:text-base text-orange-900/70">
              Latest tap pops for 3 seconds, while only last 3 records are kept on screen.
            </p>
          </div>
          <Button
            type="button"
            onClick={refreshAll}
            className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 bg-orange-100/70 p-1">
          <TabsTrigger value="live" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Live</TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Bulk Upload</TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4 space-y-4">
          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="text-orange-950">Latest Tap (Auto Hides)</CardTitle>
              <CardDescription>Shows the newest entry/exit immediately for 3 seconds.</CardDescription>
            </CardHeader>
            <CardContent>
              {!latest || !latestVisible ? (
                <div className="rounded-xl border border-dashed border-orange-200 p-5 text-sm text-muted-foreground">
                  Waiting for next gate tap...
                </div>
              ) : (
                <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border border-orange-200 bg-white">
                      {latest.image ? (
                        <Image src={latest.image} alt={latest.name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-orange-700">
                          {latest.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-orange-950">{latest.name}</p>
                      <p className="text-xs text-muted-foreground">GR: {latest.grNumber || "-"}</p>
                    </div>
                    <Badge className={latest.direction === "ENTRY" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-800"}>
                      {latest.direction}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-orange-900/80">{formatDateTime(latest.tappedAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="text-orange-950">Past 3 Records</CardTitle>
              <CardDescription>No full-student list is loaded here.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading live records...</div>
              ) : sortedRecent.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent taps yet.</div>
              ) : (
                <div className="space-y-3">
                  {sortedRecent.map((record) => (
                    <div key={record.id} className="rounded-lg border border-orange-100 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 overflow-hidden rounded-full border border-orange-200 bg-orange-50">
                          {record.image ? (
                            <Image src={record.image} alt={record.name} fill className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-orange-700">
                              {record.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-orange-950">{record.name}</p>
                          <p className="text-xs text-muted-foreground">GR: {record.grNumber || "-"}</p>
                        </div>
                        <Badge variant="outline" className="border-orange-200 text-orange-800">
                          {record.direction}
                        </Badge>
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800 hover:bg-orange-100">
                          <Camera className="mr-1 h-3.5 w-3.5" />
                          {uploadingFor === record.childId ? "Uploading..." : "Photo"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingFor === record.childId}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadStudentPhoto(record.childId, file);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(record.tappedAt)}</p>
                      {record.isValid === false && record.anomalyReason ? (
                        <p className="mt-1 text-xs text-red-600">{record.anomalyReason}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="mt-4">
          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-950">
                <Upload className="h-5 w-5 text-orange-600" />
                Bulk Photo Upload
              </CardTitle>
              <CardDescription>Upload many student photos in one flow.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/attendance/bulk-upload" className="block">
                <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white sm:w-auto">
                  Open Bulk Upload
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700"><Users className="h-4 w-4" /> Students</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.totalStudents}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-emerald-700"><Activity className="h-4 w-4" /> Inside</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.insideCount}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700"><Clock3 className="h-4 w-4" /> Taps (24h)</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.tapsLast24h}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700"><ShieldAlert className="h-4 w-4" /> Anomalies</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.anomalyCount}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
