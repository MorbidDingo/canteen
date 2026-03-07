"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CreditCard,
  IndianRupee,
  User,
  Wallet,
  CheckCircle,
  Loader2,
  LogOut,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  walletBalance: number;
};

export default function OperatorTopupPage() {
  const [rfidInput, setRfidInput] = useState("");
  const [amount, setAmount] = useState("");
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [lastTopup, setLastTopup] = useState<{
    childName: string;
    amount: number;
    newBalance: number;
  } | null>(null);

  const rfidRef = useRef<HTMLInputElement>(null);

  // Auto-focus on the RFID input whenever idle
  useEffect(() => {
    rfidRef.current?.focus();
  }, [childInfo, lastTopup]);

  // Look up child by RFID card
  const lookupCard = useCallback(async (cardId: string) => {
    if (!cardId.trim()) return;
    setLoading(true);
    setChildInfo(null);
    setLastTopup(null);
    try {
      const res = await fetch(
        `/api/operator/lookup?rfid=${encodeURIComponent(cardId.trim())}`,
      );
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Card not found");
        setRfidInput("");
        return;
      }
      const data = await res.json();
      setChildInfo(data);
    } catch {
      toast.error("Failed to look up card");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle RFID scan (Enter key from USB HID reader)
  const handleRfidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupCard(rfidInput);
    }
  };

  // Perform top-up
  const handleTopup = async () => {
    if (!childInfo) return;
    const topupAmount = parseFloat(amount);
    if (isNaN(topupAmount) || topupAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (topupAmount > 5000) {
      toast.error("Maximum top-up is ₹5,000");
      return;
    }

    setTopupLoading(true);
    try {
      const res = await fetch("/api/operator/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: childInfo.id, amount: topupAmount }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Top-up failed");
        return;
      }
      const result = await res.json();
      toast.success(`₹${topupAmount} added successfully!`);
      setLastTopup({
        childName: childInfo.name,
        amount: topupAmount,
        newBalance: result.newBalance,
      });
      setChildInfo(null);
      setRfidInput("");
      setAmount("");
    } catch {
      toast.error("Top-up failed");
    } finally {
      setTopupLoading(false);
    }
  };

  const quickAmounts = [50, 100, 200, 500];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a3a8f]/5 to-background">
      {/* Header bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#1a3a8f]" />
            <span className="font-bold text-lg">Operator — Wallet Top-Up</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
            className="gap-2 text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-lg px-4 py-8 space-y-6">
        {/* RFID Scan Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#1a3a8f]" />
              Scan Student Card
            </CardTitle>
            <CardDescription>
              Tap the RFID card on the reader or type the card ID
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              ref={rfidRef}
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              onKeyDown={handleRfidKeyDown}
              placeholder="Waiting for card scan..."
              className="text-center text-xxl font-mono tracking-widest"
              autoFocus
              disabled={loading}
            />
            {loading && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up card...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Child Info + Top-up */}
        {childInfo && (
          <Card className="border-[#2eab57]/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-[#2eab57]" />
                  {childInfo.name}
                </CardTitle>
                <Badge variant="outline" className="text-sm">
                  {childInfo.className}
                  {childInfo.section ? ` — ${childInfo.section}` : ""}
                </Badge>
              </div>
              {childInfo.grNumber && (
                <CardDescription>GR: {childInfo.grNumber}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-3xl font-bold text-[#1a3a8f]">
                  ₹{childInfo.walletBalance.toFixed(2)}
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="amount">Top-Up Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  max="5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="text-lg"
                />
                <div className="flex gap-2 flex-wrap">
                  {quickAmounts.map((qa) => (
                    <Button
                      key={qa}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmount(qa.toString())}
                    >
                      ₹{qa}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleTopup}
                disabled={topupLoading || !amount}
                className="w-full bg-[#2eab57] hover:bg-[#259c4c] text-white"
                size="lg"
              >
                {topupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <IndianRupee className="h-4 w-4 mr-2" />
                )}
                Add ₹{amount || "0"} to Wallet
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setChildInfo(null);
                  setRfidInput("");
                  setAmount("");
                }}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Success confirmation */}
        {lastTopup && (
          <Card className="border-[#2eab57] bg-[#2eab57]/5">
            <CardContent className="pt-6 text-center space-y-2">
              <CheckCircle className="h-12 w-12 text-[#2eab57] mx-auto" />
              <h3 className="text-lg font-semibold">Top-Up Successful!</h3>
              <p className="text-muted-foreground">
                Added <strong>₹{lastTopup.amount}</strong> to{" "}
                <strong>{lastTopup.childName}</strong>&apos;s wallet
              </p>
              <p className="text-2xl font-bold text-[#1a3a8f]">
                New Balance: ₹{lastTopup.newBalance.toFixed(2)}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setLastTopup(null);
                  rfidRef.current?.focus();
                }}
              >
                Scan Next Card
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
