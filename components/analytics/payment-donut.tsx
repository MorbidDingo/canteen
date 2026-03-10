"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/constants";

const PAYMENT_COLORS: Record<string, string> = {
  WALLET: "#2eab57",
  ONLINE: "#6366f1",
  UPI: "#f59e0b",
  CASH: "#94a3b8",
};

interface PaymentDonutProps {
  data: { method: string; count: number; amount: number }[];
}

export function PaymentDonut({ data }: PaymentDonutProps) {
  const chartData = data.map((d) => ({
    name: PAYMENT_METHOD_LABELS[d.method as PaymentMethod] || d.method,
    value: d.amount,
    count: d.count,
    color: PAYMENT_COLORS[d.method] || "#94a3b8",
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={4}
          dataKey="value"
          label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
          style={{ fontSize: "11px" }}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, props) => {
            const count = (props?.payload as { count?: number })?.count ?? 0;
            return [`₹${Number(value).toLocaleString()} (${count} orders)`, "Amount"];
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
