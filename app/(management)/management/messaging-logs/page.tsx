"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  MessageCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface MessagingLog {
  id: string;
  parentId: string;
  childId?: string;
  parentName?: string;
  childName?: string;
  phoneNumber: string;
  type: "WHATSAPP" | "SMS" | "FAILED";
  notificationType: string;
  messageContent: string;
  sentAt: string;
  deliveredAt?: string;
  failureReason?: string;
}

interface MessagingStats {
  total: number;
  byType: {
    WHATSAPP: number;
    SMS: number;
    FAILED: number;
  };
  byNotificationType: Record<string, number>;
  successRate: number;
}

export default function MessagingLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<MessagingLog[]>([]);
  const [stats, setStats] = useState<MessagingStats | null>(null);
  const [parentId, setParentId] = useState("");
  const [childId, setChildId] = useState("");
  const [type, setType] = useState<"" | "WHATSAPP" | "SMS" | "FAILED">("");
  const [notificationType, setNotificationType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (parentId) params.append("parentId", parentId);
      if (childId) params.append("childId", childId);
      if (type) params.append("type", type);
      if (notificationType) params.append("notificationType", notificationType);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      params.append("limit", limit.toString());
      params.append("offset", (page * limit).toString());

      const res = await fetch(`/api/management/messaging-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error("Failed to load logs:", error);
      toast.error("Failed to load messaging logs");
    } finally {
      setLoading(false);
    }
  }, [parentId, childId, type, notificationType, startDate, endDate, page]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/management/messaging-logs/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data.stats);
      } catch (error) {
        console.error("Failed to load stats:", error);
      }
    };

    fetchStats();
  }, []);

  // Fetch logs on filter change
  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleResetFilters = () => {
    setParentId("");
    setChildId("");
    setType("");
    setNotificationType("");
    setStartDate("");
    setEndDate("");
    setPage(0);
  };

  const typeIcon = (t: string) => {
    switch (t) {
      case "WHATSAPP":
        return <MessageCircle className="h-4 w-4" />;
      case "SMS":
        return <Clock className="h-4 w-4" />;
      case "FAILED":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const typeColor = (t: string) => {
    switch (t) {
      case "WHATSAPP":
        return "bg-green-100 text-green-800";
      case "SMS":
        return "bg-blue-100 text-blue-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "";
    }
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case "WHATSAPP":
        return "WhatsApp";
      case "SMS":
        return "SMS";
      case "FAILED":
        return "Failed";
      default:
        return t;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messaging Logs</h1>
        <p className="text-muted-foreground mt-2">
          Monitor all SMS and WhatsApp messages sent to parents
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.WHATSAPP}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0
                  ? `${Math.round((stats.byType.WHATSAPP / stats.total) * 100)}%`
                  : "0%"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  SMS
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.SMS}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0
                  ? `${Math.round((stats.byType.SMS / stats.total) * 100)}%`
                  : "0%"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label htmlFor="parent-id">Parent ID</Label>
              <Input
                id="parent-id"
                placeholder="Filter by parent ID"
                value={parentId}
                onChange={(e) => {
                  setParentId(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="child-id">Child ID</Label>
              <Input
                id="child-id"
                placeholder="Filter by child ID"
                value={childId}
                onChange={(e) => {
                  setChildId(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Message Type</Label>
              <Select
                value={type}
                onValueChange={(val: any) => {
                  setType(val);
                  setPage(0);
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-type">Notification Type</Label>
              <Select
                value={notificationType}
                onValueChange={(val) => {
                  setNotificationType(val);
                  setPage(0);
                }}
              >
                <SelectTrigger id="notif-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  <SelectItem value="GATE_ENTRY">Gate Entry</SelectItem>
                  <SelectItem value="GATE_EXIT">Gate Exit</SelectItem>
                  <SelectItem value="WALLET_TOPUP">Wallet Top-up</SelectItem>
                  <SelectItem value="TEMPORARY_CARD_ISSUED">Temp Card</SelectItem>
                  <SelectItem value="KIOSK_ORDER_GIVEN">Order Placed</SelectItem>
                  <SelectItem value="KIOSK_ORDER_SERVED">Order Served</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>

          <div className="mt-4">
            <Button
              variant="outline"
              onClick={handleResetFilters}
              disabled={
                !parentId &&
                !childId &&
                !type &&
                !notificationType &&
                !startDate &&
                !endDate
              }
            >
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Message History</CardTitle>
          <CardDescription>
            Total: {logs.length > 0 ? logs.length : "No"} messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No messages found. Try adjusting your filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Parent</TableHead>
                      <TableHead>Child</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {new Date(log.sentAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {log.parentName || log.parentId.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {log.childName || log.childId?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={typeColor(log.type)}>
                            <div className="flex items-center gap-1">
                              {typeIcon(log.type)}
                              {typeLabel(log.type)}
                            </div>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.notificationType}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-xs">
                          {log.phoneNumber}
                        </TableCell>
                        <TableCell>
                          {log.type === "FAILED" ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="text-xs">
                                Failed
                              </Badge>
                              {log.failureReason && (
                                <p className="text-xs text-red-600 max-w-xs truncate">
                                  {log.failureReason}
                                </p>
                              )}
                            </div>
                          ) : log.deliveredAt ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Delivered
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                              Sent
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
