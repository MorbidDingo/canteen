"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CATEGORY_CHART_COLORS, MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";

interface CategoryPieChartProps {
  data: { category: string; revenue: number; quantity: number }[];
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  const chartData = data.map((d) => ({
    name: MENU_CATEGORY_LABELS[d.category as MenuCategory] || d.category,
    value: d.revenue,
    quantity: d.quantity,
    color: CATEGORY_CHART_COLORS[d.category as MenuCategory] || "#94a3b8",
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
          style={{ fontSize: "11px" }}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, props) => {
            const quantity = (props?.payload as { quantity?: number })?.quantity ?? 0;
            return [`₹${Number(value).toLocaleString()} (${quantity} units)`, "Revenue"];
          }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
