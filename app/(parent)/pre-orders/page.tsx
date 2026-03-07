"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CalendarClock,
  Loader2,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { PRE_ORDER_STATUS_LABELS, type PreOrderStatus } from "@/lib/constants";

type PreOrderWithItems = {
  id: string;
  childName: string;
  scheduledDate: string;
  status: PreOrderStatus;
  createdAt: string;
  items: {
    name: string;
    quantity: number;
  }[];
};

export default function PreOrdersPage() {
  const [preOrders, setPreOrders] = useState<PreOrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPreOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/pre-orders");
      if (res.ok) {
        setPreOrders(await res.json());
      }
    } catch {
      toast.error("Failed to load pre-orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreOrders();
  }, [fetchPreOrders]);

  const statusIcon = (status: PreOrderStatus) => {
    switch (status) {
      case "PENDING":
        return <Clock className="h-4 w-4 text-[#f58220]" />;
      case "FULFILLED":
        return <CheckCircle className="h-4 w-4 text-[#2eab57]" />;
      case "CANCELLED":
        return <XCircle className="h-4 w-4 text-[#e32726]" />;
      case "EXPIRED":
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusColor = (status: PreOrderStatus) => {
    switch (status) {
      case "PENDING":
        return "bg-[#f58220]/15 text-[#c66a10]";
      case "FULFILLED":
        return "bg-[#2eab57]/15 text-[#1e7a3c]";
      case "CANCELLED":
        return "bg-[#e32726]/10 text-[#e32726]";
      case "EXPIRED":
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-[#1a3a8f]" />
          Pre-Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schedule orders in advance for your children
        </p>
      </div>

      {preOrders.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No pre-orders yet. This feature is coming soon!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {preOrders.map((po) => (
            <Card key={po.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{po.childName}</CardTitle>
                  <Badge className={statusColor(po.status)}>
                    {statusIcon(po.status)}
                    <span className="ml-1">
                      {PRE_ORDER_STATUS_LABELS[po.status]}
                    </span>
                  </Badge>
                </div>
                <CardDescription>
                  For: {new Date(po.scheduledDate).toLocaleDateString("en-IN")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <div className="space-y-1">
                  {po.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Created: {new Date(po.createdAt).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
