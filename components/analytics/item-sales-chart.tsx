"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ItemSalesChartProps {
  data: { date: string; quantity: number; cancelledQty: number }[];
  itemName: string;
}

export function ItemSalesChart({ data, itemName }: ItemSalesChartProps) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">
        Daily sales: {itemName}
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
            className="fill-muted-foreground"
          />
          <YAxis fontSize={11} className="fill-muted-foreground" />
          <Tooltip
            labelFormatter={(label) =>
              new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
            }
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="quantity" name="Sold" fill="#2eab57" radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="cancelledQty"
            name="Cancelled"
            fill="#e32726"
            radius={[4, 4, 0, 0]}
            opacity={0.7}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
