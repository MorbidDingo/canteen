"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BookOpen,
  Copy,
  BookCheck,
  AlertTriangle,
  IndianRupee,
  RefreshCw,
  Loader2,
  Repeat,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BOOK_CATEGORY_LABELS, type BookCategory } from "@/lib/constants";

interface Stats {
  overview: {
    totalBooks: number;
    totalCopies: number;
    availableCopies: number;
    issuedCopies: number;
    overdueCount: number;
    totalFinesCollected: number;
  };
  dailyTrends: {
    date: string;
    issued: number;
    returned: number;
    fines: number;
  }[];
  categoryDistribution: { category: string; count: number }[];
  popularBooks: {
    bookId: string;
    title: string;
    author: string;
    category: string;
    issueCount: number;
  }[];
  classWiseIssuance: { className: string; count: number }[];
  frequentVisitors: {
    childId: string;
    name: string;
    className: string;
    issueCount: number;
  }[];
  overdueReport: {
    issuanceId: string;
    bookTitle: string;
    accessionNumber: string;
    childName: string;
    className: string;
    dueDate: string;
    overdueDays: number;
  }[];
  reissueRate: number;
  avgHoldDays: number;
}

const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#f97316",
];

export default function LibraryStatisticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const fetchStats = useCallback(async (d: string) => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/management/library/statistics?days=${d}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStats(data);
    } catch {
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(days);
  }, [days, fetchStats]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { overview } = stats;

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#1a3a8f]" />
            Library Statistics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analytics and reports for the library module
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStats(days)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          icon={<BookOpen className="h-5 w-5 text-[#1a3a8f]" />}
          label="Total Books"
          value={overview.totalBooks}
        />
        <KPICard
          icon={<Copy className="h-5 w-5 text-indigo-600" />}
          label="Total Copies"
          value={overview.totalCopies}
        />
        <KPICard
          icon={<BookCheck className="h-5 w-5 text-green-600" />}
          label="Available"
          value={overview.availableCopies}
        />
        <KPICard
          icon={<BookOpen className="h-5 w-5 text-blue-600" />}
          label="Issued"
          value={overview.issuedCopies}
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          label="Overdue"
          value={overview.overdueCount}
          highlight={overview.overdueCount > 0}
        />
        <KPICard
          icon={<IndianRupee className="h-5 w-5 text-green-600" />}
          label="Fines Collected"
          value={`₹${overview.totalFinesCollected.toFixed(0)}`}
        />
      </div>

      {/* Small KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Repeat className="h-5 w-5 text-purple-600" />
            <div>
              <div className="text-xl font-bold">{stats.reissueRate}%</div>
              <div className="text-xs text-muted-foreground">Reissue Rate</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-orange-600" />
            <div>
              <div className="text-xl font-bold">{stats.avgHoldDays} days</div>
              <div className="text-xs text-muted-foreground">
                Avg Hold Duration
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Issuance & Return Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Issuance & Return Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={stats.dailyTrends}
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient
                    id="issuedGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#6366f1"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#6366f1"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="returnedGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#22c55e"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#22c55e"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis dataKey="date" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="issued"
                  stroke="#6366f1"
                  fill="url(#issuedGrad)"
                  name="Issued"
                />
                <Area
                  type="monotone"
                  dataKey="returned"
                  stroke="#22c55e"
                  fill="url(#returnedGrad)"
                  name="Returned"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Books by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.categoryDistribution}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(props: any) =>
                    `${BOOK_CATEGORY_LABELS[props.name as BookCategory] || props.name}: ${props.value}`
                  }
                >
                  {stats.categoryDistribution.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Popular Books */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Most Popular Books (All Time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.popularBooks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No issuances yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.popularBooks}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="title"
                    type="category"
                    width={120}
                    fontSize={11}
                    tick={{ width: 120 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="issueCount"
                    fill="#6366f1"
                    radius={[0, 4, 4, 0]}
                    name="Issues"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Class-wise Issuance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Class-wise Issuance (All Time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.classWiseIssuance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No issuances yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.classWiseIssuance}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="className" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    name="Issues"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fine Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fine Collection Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={stats.dailyTrends}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient
                  id="fineGrad"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-muted"
              />
              <XAxis dataKey="date" fontSize={11} tickLine={false} />
              <YAxis fontSize={11} tickLine={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="fines"
                stroke="#f97316"
                fill="url(#fineGrad)"
                name="Fines (₹)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Frequent Visitors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Frequent Visitors (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.frequentVisitors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No data yet
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Student</th>
                    <th className="text-left py-2 pr-3">Class</th>
                    <th className="text-right py-2">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.frequentVisitors.map((v, i) => (
                    <tr key={v.childId}>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="py-2 pr-3 font-medium">{v.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {v.className || "—"}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {v.issueCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Overdue Report */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Overdue Books
              {overview.overdueCount > 0 && (
                <Badge variant="destructive">{overview.overdueCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.overdueReport.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No overdue books 🎉
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="border-b sticky top-0 bg-background">
                    <tr>
                      <th className="text-left py-2 pr-2">Book</th>
                      <th className="text-left py-2 pr-2">Student</th>
                      <th className="text-right py-2">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stats.overdueReport.map((r) => (
                      <tr key={r.issuanceId}>
                        <td className="py-2 pr-2">
                          <div className="font-medium truncate max-w-[150px]">
                            {r.bookTitle}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {r.accessionNumber}
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <div>{r.childName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.className || "—"}
                          </div>
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant="destructive">
                            {r.overdueDays}d
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// KPI card component
function KPICard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-red-200" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">{icon}</div>
        <div
          className={`text-2xl font-bold ${highlight ? "text-red-600" : ""}`}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
