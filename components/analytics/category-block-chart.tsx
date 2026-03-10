"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  MENU_CATEGORY_LABELS,
  CATEGORY_CHART_COLORS,
  type MenuCategory,
} from "@/lib/constants";

interface CategoryBlockChartProps {
  data: {
    category: string;
    blockedCount: number;
    totalParents: number;
    percentage: number;
  }[];
}

export function CategoryBlockChart({ data }: CategoryBlockChartProps) {
  const chartData = data.map((d) => ({
    name: MENU_CATEGORY_LABELS[d.category as MenuCategory] || d.category,
    blocked: d.blockedCount,
    percentage: d.percentage,
    color: CATEGORY_CHART_COLORS[d.category as MenuCategory] || "#94a3b8",
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <XAxis type="number" fontSize={11} className="fill-muted-foreground" />
        <YAxis
          type="category"
          dataKey="name"
          fontSize={12}
          width={90}
          className="fill-muted-foreground"
        />
        <Tooltip
          formatter={(value, _name, props) => {
            const percentage = (props?.payload as { percentage?: number })?.percentage ?? 0;
            return [`${value} parents (${percentage}%)`, "Blocked by"];
          }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="blocked" name="Blocked" radius={[0, 6, 6, 0]} barSize={24}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} opacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
