"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Download,
} from "lucide-react";
import { BulkUploadLogPanel } from "@/components/bulk-upload-log-panel";
import { BulkUploadStatusPanel, type UploadStage } from "@/components/bulk-upload-status-panel";

interface UploadResult {
  row: number;
  studentName: string;
  grNumber: string;
  parentName: string;
  parentEmail: string | null;
  password: string | null;
  status: "created" | "skipped" | "error";
  message: string;
  parentId: string | null;
  isNewParent: boolean;
}

interface UploadSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}

export default function BulkUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [statusText, setStatusText] = useState("Waiting for file");
  const [showAllResults, setShowAllResults] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { row: number; error: string }[] | null
  >(null);
  const [liveLogs, setLiveLogs] = useState<
    { row: number; status: "created" | "skipped" | "error"; message: string; processed: number; total: number }[]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);

  const stageOrder = [
    { key: "upload", label: "Upload" },
    { key: "parsing", label: "Parse" },
    { key: "validating", label: "Validate" },
    { key: "preloading", label: "Preload" },
    { key: "creating-parents", label: "Parents" },
    { key: "creating-students", label: "Students" },
    { key: "finalizing", label: "Finalize" },
  ] as const;

  const [stages, setStages] = useState<UploadStage[]>(
    stageOrder.map((s, idx) => ({
      key: s.key,
      label: s.label,
      state: idx === 0 ? "active" : "pending",
      progress: idx === 0 ? 0 : 0,
    })),
  );

  function advanceStage(stageKey: string, message?: string, progress?: number) {
    setStages((prev) => {
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
    if (message) setStatusText(message);
  }

  function getNewParentCredentials() {
    if (!results) return [] as { email: string; password: string; parentName: string }[];

    const seen = new Set<string>();
    return results
      .filter((r) => r.status === "created" && r.isNewParent && r.parentEmail && r.password)
      .filter((r) => {
        if (seen.has(r.parentEmail!)) return false;
        seen.add(r.parentEmail!);
        return true;
      })
      .map((r) => ({
        email: r.parentEmail!,
        password: r.password!,
        parentName: r.parentName,
      }));
  }

  async function handleUpload() {
    if (uploadInFlightRef.current) return;

    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("Please upload an Excel (.xlsx, .xls) or CSV file");
      return;
    }

    uploadInFlightRef.current = true;
    setUploading(true);
    setResults(null);
    setSummary(null);
    setValidationErrors(null);
    setShowAllResults(false);
    setLiveLogs([]);
    setUploadPercent(0);
    setStatusText("Uploading file");
    setStages(stageOrder.map((s, idx) => ({ key: s.key, label: s.label, state: idx === 0 ? "active" : "pending", progress: 0 })));

    toast.info(`Uploading ${file.name}...`);

    try {
      await new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        let responseCursor = 0;
        let buffer = "";

        xhr.open("POST", "/api/management/bulk-upload?mode=stream", true);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.round((event.loaded / event.total) * 100);
          setUploadPercent(pct);
          setStages((prev) =>
            prev.map((s, idx) =>
              idx === 0 ? { ...s, state: pct >= 100 ? "done" : "active", progress: pct } : s,
            ),
          );
          if (pct >= 100) {
            setStatusText("Upload complete, starting processing");
            advanceStage("parsing", undefined, 5);
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
              advanceStage(payload.stage, payload.message, payload.progress);
            }

            if (event === "row") {
              advanceStage("creating-students", "Processing row logs");
              setLiveLogs((prev) => [
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
              setStages((prev) => prev.map((s) => ({ ...s, state: "done" })));
              setStatusText("Completed");
              setSummary(payload.summary);
              setResults(payload.results);
              toast.success(`${payload.summary.created} created, ${payload.summary.skipped} skipped, ${payload.summary.errors} errors`);
            }

            if (event === "error") {
              toast.error(payload.message || "Upload failed");
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
            setUploadPercent(100);
            resolve();
            return;
          }

          reject(new Error("Upload failed"));
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });
    } catch {
      toast.error("Failed to upload file");
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  }

  async function handleSendCredentials() {
    const credentials = getNewParentCredentials();

    if (credentials.length === 0) {
      toast.info("No new parent credentials to send");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/management/send-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send credentials");
        return;
      }

      toast.success(`Sent ${data.sent} email(s), ${data.failed} failed`);
    } catch {
      toast.error("Failed to send credentials");
    } finally {
      setSending(false);
    }
  }

  function handleDownloadCredentials() {
    const credentials = getNewParentCredentials();
    if (credentials.length === 0) {
      toast.info("No new parent credentials to download");
      return;
    }

    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ["parentName", "email", "password"];
    const lines = [
      header.join(","),
      ...credentials.map((c) => [escapeCell(c.parentName), escapeCell(c.email), escapeCell(c.password)].join(",")),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parent_credentials_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTemplate() {
    const header = "student,parent,email,gr,class,section";
    const sampleRow = "John Doe,Jane Doe,jane@example.com,GR001,5,A";
    const csv = `${header}\n${sampleRow}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const newParentCount = results
    ? new Set(
        results
          .filter((r) => r.isNewParent && r.parentEmail && r.password)
          .map((r) => r.parentEmail),
      ).size
    : 0;
  const visibleResults = results ? (showAllResults ? results : results.slice(0, 50)) : [];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[#1a3a8f]" />
            Bulk Upload Students
          </CardTitle>
          <CardDescription>
            Upload an Excel or CSV file to create students and parent accounts in
            bulk. Required columns: <strong>student</strong> (name),{" "}
            <strong>gr</strong> (GR number). Optional: <strong>parent</strong>{" "}
            (name), <strong>email</strong>, <strong>class</strong>,{" "}
            <strong>section</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name ?? "")}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-[#1a3a8f]/10 file:text-[#1a3a8f] hover:file:bg-[#1a3a8f]/20 cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-1" />
                Template
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !selectedFileName}
                className="bg-[#1a3a8f] hover:bg-[#1a3a8f]/90"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                )}
                {uploading ? "Processing..." : "Upload & Process"}
              </Button>
            </div>
          </div>

          {selectedFileName ? (
            <p className="text-xs text-muted-foreground">Selected file: {selectedFileName}</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            If an email is provided and no parent exists with that email, a new
            parent account is created with a random password. Students with
            duplicate GR numbers are skipped. Supports 2000+ rows.
          </p>
        </CardContent>
      </Card>

      {uploading || liveLogs.length > 0 ? (
        <>
          <BulkUploadStatusPanel uploadPercent={uploadPercent} stages={stages} statusText={statusText} />
          <BulkUploadLogPanel logs={liveLogs} />
        </>
      ) : null}

      {/* Validation Errors */}
      {validationErrors && validationErrors.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Validation Errors — Fix these in your file and re-upload
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {validationErrors.map((e, i) => (
                <p key={i} className="text-sm">
                  <span className="font-medium">Row {e.row}:</span> {e.error}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </CardContent>
          </Card>
          <Card className="border-[#2eab57]/30">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-[#2eab57]">
                {summary.created}
              </p>
              <p className="text-xs text-muted-foreground">Created</p>
            </CardContent>
          </Card>
          <Card className="border-[#f58220]/30">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-[#f58220]">
                {summary.skipped}
              </p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-destructive">
                {summary.errors}
              </p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Send Credentials */}
      {results && newParentCount > 0 && (
        <Card className="border-[#1a3a8f]/30">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="font-medium">
                {newParentCount} new parent account{newParentCount > 1 ? "s" : ""}{" "}
                created
              </p>
              <p className="text-sm text-muted-foreground">
                Send login credentials via email to the new parents
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSendCredentials}
                disabled={sending || uploading}
                className="bg-[#1a3a8f] hover:bg-[#1a3a8f]/90"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                {sending ? "Sending..." : "Send Credentials"}
              </Button>
              <Button
                onClick={handleDownloadCredentials}
                variant="outline"
                disabled={uploading || sending}
              >
                <Download className="h-4 w-4 mr-1" />
                Download Credentials
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results && results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Upload Results</CardTitle>
            <CardDescription>
              Showing {visibleResults.length} of {results.length} results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results.length > 50 ? (
              <div className="mb-3">
                <Button variant="outline" size="sm" onClick={() => setShowAllResults((v) => !v)}>
                  {showAllResults ? "Show less" : `Show all ${results.length} results`}
                </Button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Row</th>
                    <th className="text-left py-2 px-2 font-medium">Student</th>
                    <th className="text-left py-2 px-2 font-medium">GR</th>
                    <th className="text-left py-2 px-2 font-medium">Parent</th>
                    <th className="text-left py-2 px-2 font-medium">Password</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleResults.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-2 text-muted-foreground">
                        {r.row}
                      </td>
                      <td className="py-2 px-2 font-medium">{r.studentName}</td>
                      <td className="py-2 px-2">{r.grNumber}</td>
                      <td className="py-2 px-2">
                        <div>
                          {r.parentName || "—"}
                          {r.parentEmail && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({r.parentEmail})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {r.password || "—"}
                      </td>
                      <td className="py-2 px-2">
                        {r.status === "created" && (
                          <Badge className="bg-[#2eab57]/15 text-[#1e7a3c] gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Created
                          </Badge>
                        )}
                        {r.status === "skipped" && (
                          <Badge
                            variant="outline"
                            className="text-[#f58220] gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Skipped
                          </Badge>
                        )}
                        {r.status === "error" && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
