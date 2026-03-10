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
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { row: number; error: string }[] | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
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

    setUploading(true);
    setResults(null);
    setSummary(null);
    setValidationErrors(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/management/bulk-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          setValidationErrors(data.errors);
          toast.error(`${data.errors.length} validation error(s) found`);
        } else {
          toast.error(data.error || "Upload failed");
        }
        return;
      }

      setSummary(data.summary);
      setResults(data.results);
      toast.success(
        `${data.summary.created} created, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
      );
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handleSendCredentials() {
    if (!results) return;

    const newParents = results.filter(
      (r) => r.status === "created" && r.isNewParent && r.parentEmail && r.password,
    );

    // Deduplicate by email
    const seen = new Set<string>();
    const credentials = newParents
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
                disabled={uploading}
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

          <p className="text-xs text-muted-foreground">
            If an email is provided and no parent exists with that email, a new
            parent account is created with a random password. Students with
            duplicate GR numbers are skipped. Max 500 rows.
          </p>
        </CardContent>
      </Card>

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
            <Button
              onClick={handleSendCredentials}
              disabled={sending}
              className="bg-[#1a3a8f] hover:bg-[#1a3a8f]/90"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              {sending ? "Sending..." : "Send Credentials"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results && results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Upload Results</CardTitle>
          </CardHeader>
          <CardContent>
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
                  {results.map((r, i) => (
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
