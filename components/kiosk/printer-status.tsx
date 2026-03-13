"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  connectBluetoothPrinter,
  connectUsbPrinter,
  getPrinterStatus,
  type PrinterStatus,
} from "@/lib/printer";

const DEFAULT_STATUS: PrinterStatus = {
  connected: false,
  transport: "none",
  supportsUsb: false,
  supportsBluetooth: false,
};

export function PrinterStatusBadge() {
  const [status, setStatus] = useState<PrinterStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    const next = await getPrinterStatus();
    setStatus(next);
  };

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  const text = useMemo(() => {
    if (status.connected) {
      return status.transport === "usb" ? "Printer: USB connected" : "Printer: Bluetooth connected";
    }
    return "Printer: disconnected";
  }, [status]);

  const connect = async () => {
    setBusy(true);
    try {
      if (status.supportsUsb) {
        const ok = await connectUsbPrinter();
        if (ok) {
          await refreshStatus();
          return;
        }
      }
      if (status.supportsBluetooth) {
        const ok = await connectBluetoothPrinter();
        if (ok) {
          await refreshStatus();
          return;
        }
      }
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant={status.connected ? "default" : "secondary"}>
        {text}
      </Badge>
      {!status.connected && (status.supportsUsb || status.supportsBluetooth) ? (
        <Button type="button" size="sm" variant="outline" onClick={connect} disabled={busy}>
          {busy ? "Connecting..." : "Connect"}
        </Button>
      ) : null}
    </div>
  );
}
