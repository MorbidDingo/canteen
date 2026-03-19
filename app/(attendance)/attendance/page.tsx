"use client";

import Link from "next/link";
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
  Download,
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
  gateId?: string | null;
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
  timeInsideSeconds: number | null;
  timeInsideFormatted: string | null;
};

type ReportView =
  | "all"
  | "inside"
  | "outside"
  | "classwise"
  | "with-photo"
  | "without-photo"
  | "overstays"
  | "anomalies";

type BulkSummary = {
  total: number;
  created: number;
  skipped: number;
  errors: number;
};

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
  deviceName: string;
  deviceCode: string;
  status: "ACTIVE" | "DISABLED";
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

const OVERSTAY_SECONDS = 2 * 60 * 60;

const reportViewOptions: Array<{ value: ReportView; label: string }> = [
  { value: "all", label: "All" },
  { value: "inside", label: "Inside" },
  { value: "outside", label: "Outside" },
  { value: "classwise", label: "Class Wise" },
  { value: "with-photo", label: "With Photo" },
  { value: "without-photo", label: "Without Photo" },
  { value: "overstays", label: "Overstays" },
  { value: "anomalies", label: "Anomalies" },
];

const reportViewLabels: Record<ReportView, string> = {
  all: "All",
  inside: "Inside",
  outside: "Outside",
  classwise: "Class Wise",
  "with-photo": "With Photo",
  "without-photo": "Without Photo",
  overstays: "Overstays",
  anomalies: "Anomalies",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

export default function AttendancePage() {
  const [recent, setRecent] = useState<LiveTapRecord[]>([]);
  const [availableGates, setAvailableGates] = useState<string[]>([]);
  const [selectedGate, setSelectedGate] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState("live");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>(defaultStats);
  const [reportStudents, setReportStudents] = useState<ReportStudent[]>([]);
  const [reportQuery, setReportQuery] = useState("");
  const [reportView, setReportView] = useState<ReportView>("all");
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
  const [assignedGateDevices, setAssignedGateDevices] = useState<OrgContextDevice[]>([]);

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

  const fetchRecent = async () => {
    try {
      const res = await fetch("/api/attendance/recent?limit=3", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch recent taps");
      const data = await res.json();
      setRecent(data.records || []);
      setAvailableGates(data.gates || []);
    } catch {
      toast.error("Failed to load live attendance feed");
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async (q = reportQuery) => {
    try {
      setReportsLoading(true);
      const res = await fetch(`/api/attendance/reports?q=${encodeURIComponent(q)}&limit=200`, {
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

  useEffect(() => {
    const fetchOrgContext = async () => {
      try {
        const res = await fetch("/api/org/context", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const devices = ((data.devices || []) as OrgContextDevice[]).filter(
          (d) => d.deviceType === "GATE" && d.status === "ACTIVE",
        );
        setAssignedGateDevices(devices);
      } catch {
        // non-blocking
      }
    };

    void fetchOrgContext();

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
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports(reportQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [reportQuery]);

  const sortedRecent = useMemo(() => {
    const gateFiltered =
      selectedGate === "ALL"
        ? recent
        : recent.filter((record) => (record.gateId?.trim() || "UNASSIGNED_GATE") === selectedGate);

    return [...gateFiltered].sort(
      (a, b) => new Date(b.tappedAt).getTime() - new Date(a.tappedAt).getTime(),
    );
  }, [recent, selectedGate]);

  const filteredReportStudents = useMemo(() => {
    switch (reportView) {
      case "inside":
        return reportStudents.filter((student) => student.presenceStatus === "INSIDE");
      case "outside":
        return reportStudents.filter((student) => student.presenceStatus === "OUTSIDE");
      case "with-photo":
        return reportStudents.filter((student) => student.hasPhoto);
      case "without-photo":
        return reportStudents.filter((student) => !student.hasPhoto);
      case "overstays":
        return reportStudents.filter(
          (student) =>
            student.presenceStatus === "INSIDE" &&
            typeof student.timeInsideSeconds === "number" &&
            student.timeInsideSeconds >= OVERSTAY_SECONDS,
        );
      case "anomalies":
        return reportStudents.filter((student) => student.anomalyCount > 0);
      case "all":
      case "classwise":
      default:
        return reportStudents;
    }
  }, [reportStudents, reportView]);

  const classWiseGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        students: ReportStudent[];
      }
    >();

    for (const student of reportStudents) {
      const label = [student.className || "Unassigned", student.section || null].filter(Boolean).join("-");
      const existing = groups.get(label) || { label, students: [] };
      existing.students.push(student);
      groups.set(label, existing);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        students: group.students.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reportStudents]);

  const visibleStudents = useMemo(() => {
    return reportView === "classwise" ? reportStudents : filteredReportStudents;
  }, [filteredReportStudents, reportStudents, reportView]);

  const handleReportViewChange = (view: ReportView) => {
    setActiveTab("reports");
    setReportView(view);
  };

  const downloadFile = (content: string, fileName: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportCurrentReport = (format: "csv" | "json") => {
    const rows = visibleStudents.map((student) => ({
      name: student.name,
      grNumber: student.grNumber || "",
      className: student.className || "",
      section: student.section || "",
      classLabel: [student.className || "", student.section || ""].filter(Boolean).join("-") || "Unassigned",
      presenceStatus: student.presenceStatus,
      hasPhoto: student.hasPhoto ? "Yes" : "No",
      anomalyCount: student.anomalyCount,
      totalTaps: student.totalTaps,
      tapsLast24h: student.tapsLast24h,
      timeInside: student.timeInsideFormatted || "",
      lastGateTapAt: student.lastGateTapAt ? formatDateTime(student.lastGateTapAt) : "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase = `attendance-${reportView}-${stamp}`;

    if (format === "json") {
      downloadFile(JSON.stringify(rows, null, 2), `${fileBase}.json`, "application/json;charset=utf-8");
      return;
    }

    const headers = [
      "Name",
      "GR Number",
      "Class",
      "Section",
      "Class Label",
      "Presence",
      "Has Photo",
      "Anomalies",
      "Total Taps",
      "Taps Last 24h",
      "Inside For",
      "Last Gate Tap",
    ];

    const csvRows = rows.map((row) => [
      row.name,
      row.grNumber,
      row.className,
      row.section,
      row.classLabel,
      row.presenceStatus,
      row.hasPhoto,
      String(row.anomalyCount),
      String(row.totalTaps),
      String(row.tapsLast24h),
      row.timeInside,
      row.lastGateTapAt,
    ]);

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((cols) => cols.map(escapeCsv).join(",")).join("\n");
    downloadFile(csv, `${fileBase}.csv`, "text/csv;charset=utf-8");
  };

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
              Live gate feed with the last 3 tap records kept on screen.
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

      {assignedGateDevices.length > 0 ? (
        <Card className="border-orange-200/70">
          <CardHeader>
            <CardTitle className="text-orange-950">Open Assigned Gate Terminals</CardTitle>
            <CardDescription>Select a gate here, then run normal terminal flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {assignedGateDevices.map((device) => (
                <Link key={device.id} href={`/gate?deviceCode=${encodeURIComponent(device.deviceCode)}`}>
                  <Button type="button" variant="outline" className="border-orange-200 text-orange-900 hover:bg-orange-100">
                    {device.deviceName} ({device.deviceCode})
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 bg-orange-100/70 p-1">
          <TabsTrigger value="live" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Live</TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Bulk Upload</TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4 space-y-4">
          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="text-orange-950">Past 3 Records</CardTitle>
              <CardDescription>No full-student list is loaded here.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGate("ALL")}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${
                    selectedGate === "ALL"
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-orange-200 bg-white text-orange-900 hover:bg-orange-100"
                  }`}
                >
                  All Gates
                </button>
                {availableGates.map((gate) => (
                  <button
                    key={gate}
                    type="button"
                    onClick={() => setSelectedGate(gate)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${
                      selectedGate === gate
                        ? "border-orange-600 bg-orange-600 text-white"
                        : "border-orange-200 bg-white text-orange-900 hover:bg-orange-100"
                    }`}
                  >
                    {gate === "UNASSIGNED_GATE" ? "Unassigned" : gate}
                  </button>
                ))}
              </div>

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
                        <Badge variant="secondary" className="text-xs">
                          {record.gateId?.trim() || "UNASSIGNED_GATE"}
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
            <ReportSummaryCard
              label="Students"
              value={stats.totalStudents}
              icon={<Users className="h-4 w-4" />}
              tone="text-orange-700"
              active={reportView === "all"}
              onClick={() => handleReportViewChange("all")}
            />
            <ReportSummaryCard
              label="Inside"
              value={stats.insideCount}
              icon={<Activity className="h-4 w-4" />}
              tone="text-emerald-700"
              active={reportView === "inside"}
              onClick={() => handleReportViewChange("inside")}
            />
            <ReportSummaryCard
              label="Taps (24h)"
              value={stats.tapsLast24h}
              icon={<Clock3 className="h-4 w-4" />}
              tone="text-orange-700"
              active={reportView === "all"}
              onClick={() => handleReportViewChange("all")}
            />
            <ReportSummaryCard
              label="Anomalies"
              value={stats.anomalyCount}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="text-red-700"
              active={reportView === "anomalies"}
              onClick={() => handleReportViewChange("anomalies")}
            />
            <ReportSummaryCard
              label="Outside"
              value={stats.outsideCount}
              icon={<Clock3 className="h-4 w-4" />}
              tone="text-zinc-700"
              active={reportView === "outside"}
              onClick={() => handleReportViewChange("outside")}
            />
            <ReportSummaryCard
              label="Overstay"
              value={stats.overstayCount}
              icon={<Activity className="h-4 w-4" />}
              tone="text-amber-700"
              active={reportView === "overstays"}
              onClick={() => handleReportViewChange("overstays")}
            />
            <ReportSummaryCard
              label="With Photo"
              value={stats.withPhotoCount}
              icon={<ImageIcon className="h-4 w-4" />}
              tone="text-emerald-700"
              active={reportView === "with-photo"}
              onClick={() => handleReportViewChange("with-photo")}
            />
            <ReportSummaryCard
              label="Without Photo"
              value={stats.withoutPhotoCount}
              icon={<ImageIcon className="h-4 w-4" />}
              tone="text-orange-700"
              active={reportView === "without-photo"}
              onClick={() => handleReportViewChange("without-photo")}
            />
          </div>

          <Card className="border-orange-200/70">
            <CardHeader>
              <CardTitle className="text-orange-950">Student Reports</CardTitle>
              <CardDescription>
                Search by name, GR number, class, or section, then switch views with one click.
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

              <div className="rounded-xl border border-orange-100 bg-orange-50/80 p-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {reportViewOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setReportView(option.value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        reportView === option.value
                          ? "border-orange-600 bg-orange-600 text-white shadow-sm"
                          : "border-orange-200 bg-white text-orange-900 hover:bg-orange-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Matched: {totalMatchedStudents}</Badge>
                  <Badge variant="outline">View: {reportViewLabels[reportView]}</Badge>
                  <Badge variant="outline">Visible: {visibleStudents.length}</Badge>
                  <Badge variant="outline">Entries (24h): {stats.entriesLast24h}</Badge>
                  <Badge variant="outline">Exits (24h): {stats.exitsLast24h}</Badge>
                  <Badge variant="outline">Tap events (24h): {stats.totalTapEvents}</Badge>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-orange-200 text-orange-900 hover:bg-orange-50 sm:w-auto"
                    onClick={() => exportCurrentReport("csv")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-orange-200 text-orange-900 hover:bg-orange-50 sm:w-auto"
                    onClick={() => exportCurrentReport("json")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export JSON
                  </Button>
                </div>
              </div>

              {reportsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading report students...
                </div>
              ) : reportView === "classwise" ? (
                classWiseGroups.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No students matched your search.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {classWiseGroups.map((group) => {
                      const insideCount = group.students.filter((student) => student.presenceStatus === "INSIDE").length;
                      const withPhotoCount = group.students.filter((student) => student.hasPhoto).length;
                      const anomalyCount = group.students.filter((student) => student.anomalyCount > 0).length;
                      const overstayCount = group.students.filter(
                        (student) =>
                          student.presenceStatus === "INSIDE" &&
                          typeof student.timeInsideSeconds === "number" &&
                          student.timeInsideSeconds >= OVERSTAY_SECONDS,
                      ).length;

                      return (
                        <div key={group.label} className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-orange-950">{group.label}</p>
                              <p className="text-xs text-muted-foreground">{group.students.length} students</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <Badge className="bg-emerald-100 text-emerald-800">Inside: {insideCount}</Badge>
                              <Badge className="bg-zinc-100 text-zinc-800">Outside: {group.students.length - insideCount}</Badge>
                              <Badge className="bg-orange-100 text-orange-800">Photos: {withPhotoCount}</Badge>
                              <Badge className="bg-amber-100 text-amber-800">Overstays: {overstayCount}</Badge>
                              <Badge className="bg-red-100 text-red-800">Anomalies: {anomalyCount}</Badge>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {group.students.map((student) => (
                              <StudentReportCard key={student.childId} student={student} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : filteredReportStudents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No students matched this report view.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredReportStudents.map((student) => (
                    <StudentReportCard key={student.childId} student={student} />
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

function ReportSummaryCard({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
        active
          ? "border-orange-400 bg-orange-50 shadow-sm"
          : "border-orange-200/70 bg-white hover:border-orange-300"
      }`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="pt-6">
          <div className={`flex items-center gap-2 ${tone}`}>{icon}<span>{label}</span></div>
          <p className="mt-2 text-2xl font-bold text-orange-950">{value}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function StudentReportCard({ student }: { student: ReportStudent }) {
  return (
    <div className="rounded-lg border border-orange-100 bg-white p-3">
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
            GR: {student.grNumber || "-"} • {student.className || "-"}
            {student.section ? `-${student.section}` : ""}
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
  );
}
