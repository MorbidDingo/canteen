"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PeakHoursChartProps {
  data: { hour: number; label: string; orders: number; revenue: number }[];
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
  // Filter to hours with at least some activity (7am-10pm typical)
  const filtered = data.filter((d) => d.hour >= 7 && d.hour <= 22);
  const maxOrders = Math.max(...filtered.map((d) => d.orders), 1);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={filtered} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" fontSize={11} className="fill-muted-foreground" />
        <YAxis fontSize={11} className="fill-muted-foreground" />
        <Tooltip
          formatter={(value, name) => [
            name === "orders" ? `${value} orders` : `₹${value}`,
            name === "orders" ? "Orders" : "Revenue",
          ]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="orders"
          name="orders"
          radius={[4, 4, 0, 0]}
          fill="#6366f1"
        >
          {filtered.map((entry, index) => {
            const intensity = entry.orders / maxOrders;
            const color =
              intensity > 0.7
                ? "#ef4444"
                : intensity > 0.4
                  ? "#f59e0b"
                  : "#6366f1";
            return (
              <rect key={index} fill={color} />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
