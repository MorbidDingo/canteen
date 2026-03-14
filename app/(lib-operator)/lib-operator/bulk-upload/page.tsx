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
  Download,
  BookOpen,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { BulkUploadLogPanel } from "@/components/bulk-upload-log-panel";
import { BulkUploadStatusPanel, type UploadStage } from "@/components/bulk-upload-status-panel";

interface UploadResult {
  row: number;
  title: string;
  accessionNumber: string;
  status: "created" | "skipped" | "error";
  message: string;
  bookCreated: boolean;
}

interface UploadSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  booksCreated: number;
  copiesAdded: number;
}

export default function LibOperatorBulkUploadPage() {
  const [uploading, setUploading] = useState(false);
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

  const stageOrder = [
    { key: "upload", label: "Upload" },
    { key: "parsing", label: "Parse" },
    { key: "validating", label: "Validate" },
    { key: "preloading", label: "Preload" },
    { key: "matching-books", label: "Match" },
    { key: "creating-copies", label: "Create" },
    { key: "recounting", label: "Recount" },
    { key: "finalizing", label: "Finalize" },
  ] as const;

  const [stages, setStages] = useState<UploadStage[]>(
    stageOrder.map((s, idx) => ({ key: s.key, label: s.label, state: idx === 0 ? "active" : "pending", progress: 0 })),
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

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("Only .xlsx, .xls, or .csv files are supported");
      return;
    }

    setUploading(true);
    setResults(null);
    setSummary(null);
    setValidationErrors(null);
    setShowAllResults(false);
    setLiveLogs([]);
    setUploadPercent(0);
    setStatusText("Uploading file");
    setStages(stageOrder.map((s, idx) => ({ key: s.key, label: s.label, state: idx === 0 ? "active" : "pending", progress: 0 })));

    try {
      await new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        let responseCursor = 0;
        let buffer = "";
        xhr.open("POST", "/api/management/library/bulk-upload?mode=stream", true);

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

            if (event === "stage") advanceStage(payload.stage, payload.message, payload.progress);

            if (event === "row") {
              advanceStage("creating-copies", "Processing row logs");
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
              setResults(payload.results);
              setSummary(payload.summary);
              toast.success(`Upload complete: ${payload.summary.copiesAdded} copies added, ${payload.summary.booksCreated} books created`);
            }

            if (event === "error") toast.error(payload.message || "Upload failed");
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
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }
  const visibleResults = results ? (showAllResults ? results : results.slice(0, 50)) : [];

  function downloadTemplate() {
    const header =
      "Title,Author,ISBN,Publisher,Edition,Category,Accession Number,Condition,Location";
    const examples = [
      "Harry Potter and the Philosopher's Stone,J.K. Rowling,9780747532699,Bloomsbury,1st Edition,FICTION,ACC-001,NEW,A-1-01",
      "A Brief History of Time,Stephen Hawking,9780553380163,Bantam Books,,NON_FICTION,ACC-002,GOOD,B-2-05",
      "NCERT Mathematics Class 10,NCERT,,NCERT,2024,TEXTBOOK,ACC-003,NEW,C-3-01",
    ];
    const csv = [header, ...examples].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "library_book_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "created":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "skipped":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-[#1a3a8f]/5 to-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/lib-operator/dashboard">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#1a3a8f]" />
              <span className="font-bold text-lg">Bulk Upload</span>
            </div>
          </div>
          <Link href="/lib-operator/books">
            <Button variant="outline" size="sm">
              Book Catalog
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Upload card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5" />
              Upload Book Catalog
            </CardTitle>
            <CardDescription>
              Required columns: <strong>Title</strong>, <strong>Author</strong>,{" "}
              <strong>Accession Number</strong>.
              Optional: ISBN, Publisher, Edition, Category, Condition, Location.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                {uploading ? "Processing..." : "Upload"}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              Download Template
            </Button>
          </CardContent>
        </Card>

        {uploading || liveLogs.length > 0 ? (
          <>
            <BulkUploadStatusPanel uploadPercent={uploadPercent} stages={stages} statusText={statusText} />
            <BulkUploadLogPanel logs={liveLogs} />
          </>
        ) : null}

        {/* Validation errors */}
        {validationErrors && validationErrors.length > 0 && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-700 flex items-center gap-2 text-lg">
                <XCircle className="h-5 w-5" />
                Validation Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {validationErrors.map((e, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">Row {e.row}:</span>{" "}
                    <span className="text-red-600">{e.error}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">{summary.total}</div>
                <div className="text-xs text-muted-foreground">Total Rows</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {summary.created}
                </div>
                <div className="text-xs text-muted-foreground">Copies Added</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {summary.booksCreated}
                </div>
                <div className="text-xs text-muted-foreground">Books Created</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {summary.skipped}
                </div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {summary.errors}
                </div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results table */}
        {results && results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Results</CardTitle>
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
              <div className="max-h-125 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="border-b sticky top-0 bg-background">
                    <tr>
                      <th className="text-left py-2 pr-3">Row</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-left py-2 pr-3">Title</th>
                      <th className="text-left py-2 pr-3">Accession #</th>
                      <th className="text-left py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleResults.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 font-mono">{r.row}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1">
                            {statusIcon(r.status)}
                            <Badge
                              variant="secondary"
                              className={
                                r.status === "created"
                                  ? "bg-green-100 text-green-800"
                                  : r.status === "skipped"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                              }
                            >
                              {r.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-2 pr-3">{r.title}</td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {r.accessionNumber}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {r.message}
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
    </div>
  );
}
