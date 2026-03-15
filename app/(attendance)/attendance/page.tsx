"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BulkUploadLogPanel } from "@/components/bulk-upload-log-panel";
import { BulkUploadStatusPanel, type UploadStage } from "@/components/bulk-upload-status-panel";
import {
  Activity,
  Camera,
  Clock3,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";

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
  withPhotoCount: number;
  withoutPhotoCount: number;
  entriesLast24h: number;
  exitsLast24h: number;
};

type ReportStudent = {
  childId: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  image: string | null;
  hasPhoto: boolean;
  presenceStatus: "INSIDE" | "OUTSIDE";
  lastGateTapAt: string | null;
  totalTaps: number;
  tapsLast24h: number;
  anomalyCount: number;
  timeInsideFormatted: string | null;
};

type BulkSummary = {
  total: number;
  created: number;
  skipped: number;
  errors: number;
};

const defaultStats: SummaryStats = {
  totalStudents: 0,
  insideCount: 0,
  outsideCount: 0,
  totalTapEvents: 0,
  tapsLast24h: 0,
  anomalyCount: 0,
  overstayCount: 0,
  withPhotoCount: 0,
  withoutPhotoCount: 0,
  entriesLast24h: 0,
  exitsLast24h: 0,
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
  const [reportStudents, setReportStudents] = useState<ReportStudent[]>([]);
  const [reportQuery, setReportQuery] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [totalMatchedStudents, setTotalMatchedStudents] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const [bulkUploading, setBulkUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [bulkUploadPercent, setBulkUploadPercent] = useState(0);
  const [bulkStatusText, setBulkStatusText] = useState("Waiting for file");
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null);
  const [bulkLogs, setBulkLogs] = useState<
    { row: number; status: "created" | "skipped" | "error"; message: string; processed: number; total: number }[]
  >([]);

  const stageOrder = [
    { key: "upload", label: "Upload" },
    { key: "parsing", label: "Parse" },
    { key: "validating", label: "Validate" },
    { key: "preloading", label: "Lookup" },
    { key: "uploading", label: "Upload Photos" },
    { key: "finalizing", label: "Finalize" },
  ] as const;
  const [bulkStages, setBulkStages] = useState<UploadStage[]>(
    stageOrder.map((s, idx) => ({
      key: s.key,
      label: s.label,
      state: idx === 0 ? "active" : "pending",
      progress: idx === 0 ? 0 : 0,
    })),
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
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

  const fetchReports = async (q = reportQuery) => {
    try {
      setReportsLoading(true);
      const res = await fetch(`/api/attendance/reports?q=${encodeURIComponent(q)}&limit=50`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      setStats(data.stats || defaultStats);
      setReportStudents(data.students || []);
      setTotalMatchedStudents(data.totalMatched || 0);
    } catch {
      // Keep dashboard usable even if summary fails.
    } finally {
      setReportsLoading(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchRecent(), fetchReports(reportQuery)]);
    setRefreshing(false);
  };

  const advanceBulkStage = (stageKey: string, message?: string, progress?: number) => {
    setBulkStages((prev) => {
      const targetIndex = prev.findIndex((s) => s.key === stageKey);
      if (targetIndex < 0) return prev;
      return prev.map((s, idx) => {
        if (idx < targetIndex) return { ...s, state: "done", progress: 100 };
        if (idx === targetIndex) {
          const nextProgress = progress == null ? Math.max(s.progress ?? 0, 5) : Math.max(0, Math.min(100, progress));
          return { ...s, state: nextProgress >= 100 ? "done" : "active", progress: nextProgress };
        }
        return { ...s, state: "pending", progress: 0 };
      });
    });
    if (message) setBulkStatusText(message);
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
    fetchReports("");

    const poll = setInterval(() => {
      fetchRecent();
      fetchReports(reportQuery);
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

        fetchReports(reportQuery);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports(reportQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [reportQuery]);

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
      await Promise.all([fetchRecent(), fetchReports(reportQuery)]);
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploadingFor(null);
    }
  };

  const handleBulkUpload = async () => {
    if (uploadInFlightRef.current) return;

    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv", "json"].includes(ext)) {
      toast.error("Use .xlsx, .xls, .csv, or .json file format");
      return;
    }

    uploadInFlightRef.current = true;
    setBulkUploading(true);
    setBulkSummary(null);
    setBulkLogs([]);
    setBulkUploadPercent(0);
    setBulkStatusText("Uploading file");
    setBulkStages(stageOrder.map((s, idx) => ({ key: s.key, label: s.label, state: idx === 0 ? "active" : "pending", progress: 0 })));

    try {
      await new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        let responseCursor = 0;
        let buffer = "";

        xhr.open("POST", "/api/attendance/bulk-upload?mode=stream", true);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.round((event.loaded / event.total) * 100);
          setBulkUploadPercent(pct);
          setBulkStages((prev) =>
            prev.map((s, idx) => (idx === 0 ? { ...s, state: pct >= 100 ? "done" : "active", progress: pct } : s)),
          );
          if (pct >= 100) {
            setBulkStatusText("Upload complete, processing rows");
            advanceBulkStage("parsing", undefined, 5);
          }
        };

        const parseSseChunk = (chunkText: string) => {
          buffer += chunkText;
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.replace("event:", "").trim();
            const payload = JSON.parse(dataLine.replace("data:", "").trim());

            if (event === "stage") {
              advanceBulkStage(payload.stage, payload.message, payload.progress);
            }

            if (event === "row") {
              setBulkLogs((prev) => [
                ...prev,
                {
                  row: payload.row,
                  status: payload.status,
                  message: payload.message,
                  processed: payload.processed,
                  total: payload.total,
                },
              ]);
            }

            if (event === "done") {
              setBulkStages((prev) => prev.map((s) => ({ ...s, state: "done", progress: 100 })));
              setBulkStatusText("Completed");
              setBulkUploadPercent(100);
              setBulkSummary(payload.summary);
              toast.success(`Processed ${payload.summary.total} rows`);
            }

            if (event === "error") {
              const message = typeof payload.message === "string" ? payload.message : "Bulk upload failed";
              toast.error(message);
            }
          }
        };

        xhr.onprogress = () => {
          const nextText = xhr.responseText.slice(responseCursor);
          responseCursor = xhr.responseText.length;
          if (nextText) parseSseChunk(nextText);
        };

        xhr.onload = () => {
          const nextText = xhr.responseText.slice(responseCursor);
          if (nextText) parseSseChunk(nextText);

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }

          reject(new Error("Bulk upload failed"));
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      await fetchReports(reportQuery);
    } catch {
      toast.error("Failed to upload file");
    } finally {
      uploadInFlightRef.current = false;
      setBulkUploading(false);
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

        <TabsContent value="bulk" className="mt-4 space-y-4">
          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-950">
                <Upload className="h-5 w-5 text-orange-600" />
                Bulk Photo Upload
              </CardTitle>
              <CardDescription>
                Upload `.xlsx`, `.csv`, or `.json` with fields: `grNumber`, `fileName`, `base64`.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setSelectedFileName(file?.name || "");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="w-full sm:w-auto"
                  disabled={bulkUploading}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {selectedFileName ? "Change File" : "Choose File"}
                </Button>
                <Button
                  type="button"
                  onClick={handleBulkUpload}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white sm:w-auto"
                  disabled={bulkUploading || !selectedFileName}
                >
                  {bulkUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Start Upload
                </Button>
              </div>

              {selectedFileName ? (
                <p className="text-xs text-muted-foreground">Selected file: {selectedFileName}</p>
              ) : null}

              <BulkUploadStatusPanel
                uploadPercent={bulkUploadPercent}
                stages={bulkStages}
                statusText={bulkStatusText}
              />
              <BulkUploadLogPanel logs={bulkLogs} title="Bulk Photo Processing Logs" />

              {bulkSummary ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Total: {bulkSummary.total}</Badge>
                  <Badge className="bg-emerald-100 text-emerald-800">Uploaded: {bulkSummary.created}</Badge>
                  <Badge className="bg-amber-100 text-amber-800">Skipped: {bulkSummary.skipped}</Badge>
                  <Badge className="bg-red-100 text-red-800">Errors: {bulkSummary.errors}</Badge>
                </div>
              ) : null}
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
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-zinc-700"><Clock3 className="h-4 w-4" /> Outside</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.outsideCount}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-amber-700"><Activity className="h-4 w-4" /> Overstay</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.overstayCount}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-emerald-700"><ImageIcon className="h-4 w-4" /> With Photo</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.withPhotoCount}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200/70">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700"><ImageIcon className="h-4 w-4" /> Without Photo</div>
                <p className="mt-2 text-2xl font-bold text-orange-950">{stats.withoutPhotoCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="text-orange-950">Search Students</CardTitle>
              <CardDescription>
                Search by name, GR number, class, or section. Showing last 50 matched rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={reportQuery}
                  onChange={(e) => setReportQuery(e.target.value)}
                  placeholder="Search name, GR number, class, section"
                  className="pl-10"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Matched: {totalMatchedStudents}</Badge>
                <Badge variant="outline">Entries (24h): {stats.entriesLast24h}</Badge>
                <Badge variant="outline">Exits (24h): {stats.exitsLast24h}</Badge>
                <Badge variant="outline">Tap events (24h): {stats.totalTapEvents}</Badge>
              </div>

              {reportsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading report students...
                </div>
              ) : reportStudents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No students matched your search.
                </div>
              ) : (
                <div className="space-y-2">
                  {reportStudents.map((student) => (
                    <div key={student.childId} className="rounded-lg border border-orange-100 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 overflow-hidden rounded-full border border-orange-200 bg-orange-50">
                          {student.image ? (
                            <Image src={student.image} alt={student.name} fill className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-orange-700">
                              {student.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-orange-950">{student.name}</p>
                          <p className="text-xs text-muted-foreground">
                            GR: {student.grNumber || "-"} • {student.className || "-"}{student.section ? `-${student.section}` : ""}
                          </p>
                        </div>

                        <Badge className={student.presenceStatus === "INSIDE" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-800"}>
                          {student.presenceStatus}
                        </Badge>
                        <Badge variant="outline" className={student.hasPhoto ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>
                          {student.hasPhoto ? "Photo" : "No Photo"}
                        </Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Total taps: {student.totalTaps}</span>
                        <span>Taps (24h): {student.tapsLast24h}</span>
                        <span>Anomalies: {student.anomalyCount}</span>
                        {student.timeInsideFormatted ? <span>Inside for: {student.timeInsideFormatted}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
