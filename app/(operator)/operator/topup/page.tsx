"use client";

import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CreditCard,
  IndianRupee,
  User,
  Wallet,
  CheckCircle,
  Loader2,
  LogOut,
  UserPlus,
  Clock3,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  walletBalance: number;
  cardSource?: "PERMANENT" | "TEMPORARY";
  temporaryValidUntil?: string | null;
};

type TemporaryCardRecord = {
  id: string;
  childId: string;
  childName: string;
  className: string | null;
  section: string | null;
  accessType: "STUDENT_TEMP" | "GUEST_TEMP";
  temporaryRfidCardId: string;
  validFrom: string;
  validUntil: string;
  revokedAt: string | null;
  isActive: boolean;
};

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
  deviceName: string;
  deviceCode: string;
  status: "ACTIVE" | "DISABLED";
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function OperatorTopupPage() {
  const [activeTab, setActiveTab] = useState("topup");

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

  const [studentLookupCard, setStudentLookupCard] = useState("");
  const [studentLookupLoading, setStudentLookupLoading] = useState(false);
  const [studentTarget, setStudentTarget] = useState<ChildInfo | null>(null);
  const [studentTempCardId, setStudentTempCardId] = useState("");
  const [studentTempHours, setStudentTempHours] = useState("1");
  const [studentAssigning, setStudentAssigning] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestCardId, setGuestCardId] = useState("");
  const [guestHours, setGuestHours] = useState("24");
  const [guestCreating, setGuestCreating] = useState(false);

  const [temporaryCards, setTemporaryCards] = useState<TemporaryCardRecord[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [revokeLoadingId, setRevokeLoadingId] = useState<string | null>(null);
  const [assignedKioskDevices, setAssignedKioskDevices] = useState<OrgContextDevice[]>([]);

  const rfidRef = useRef<HTMLInputElement>(null);
  const studentLookupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "topup") {
      rfidRef.current?.focus();
    }
  }, [activeTab, childInfo, lastTopup]);

  useEffect(() => {
    if (activeTab === "student-temp") {
      studentLookupRef.current?.focus();
    }
  }, [activeTab]);

  const fetchTemporaryCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const res = await fetch("/api/operator/temporary-cards", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load temporary cards");
      const data = await res.json();
      setTemporaryCards(data.cards || []);
    } catch {
      toast.error("Failed to load temporary cards");
    } finally {
      setCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemporaryCards();
  }, [fetchTemporaryCards]);

  useEffect(() => {
    const fetchOrgContext = async () => {
      try {
        const res = await fetch("/api/org/context", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const devices = ((data.devices || []) as OrgContextDevice[]).filter(
          (d) => d.deviceType === "KIOSK" && d.status === "ACTIVE",
        );
        setAssignedKioskDevices(devices);
      } catch {
        // non-blocking
      }
    };

    void fetchOrgContext();
  }, []);

  const lookupCard = useCallback(async (cardId: string) => {
    if (!cardId.trim()) return;
    setLoading(true);
    setChildInfo(null);
    setLastTopup(null);
    try {
      const res = await fetch(`/api/operator/lookup?rfid=${encodeURIComponent(cardId.trim())}`);
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

  const lookupStudentForTempCard = useCallback(async (cardId: string) => {
    if (!cardId.trim()) return;
    setStudentLookupLoading(true);
    setStudentTarget(null);
    try {
      const res = await fetch(`/api/operator/lookup?rfid=${encodeURIComponent(cardId.trim())}`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Card not found");
        return;
      }
      const data = await res.json();
      setStudentTarget(data);
      setStudentTempCardId("");
      setStudentTempHours("1");
    } catch {
      toast.error("Failed to look up account");
    } finally {
      setStudentLookupLoading(false);
    }
  }, []);

  const handleRfidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void lookupCard(rfidInput);
    }
  };

  const handleTopup = async () => {
    if (!childInfo) return;
    const topupAmount = parseFloat(amount);
    if (Number.isNaN(topupAmount) || topupAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (topupAmount > 5000) {
      toast.error("Maximum top-up is Rs5000");
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
      toast.success(`Rs${topupAmount} added successfully`);
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

  const handleAssignStudentTempCard = async () => {
    if (!studentTarget) return;

    const durationHours = parseInt(studentTempHours, 10);
    if (Number.isNaN(durationHours) || durationHours < 1 || durationHours > 48) {
      toast.error("Duration must be between 1 and 48 hours");
      return;
    }
    if (!studentTempCardId.trim()) {
      toast.error("Temporary RFID card id is required");
      return;
    }

    setStudentAssigning(true);
    try {
      const res = await fetch("/api/operator/temporary-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: studentTarget.id,
          temporaryRfidCardId: studentTempCardId.trim(),
          durationHours,
          accessType: "STUDENT_TEMP",
          notes: "Temporary student access card",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to assign temporary card");
        return;
      }

      toast.success("Temporary card assigned");
      setStudentTempCardId("");
      setStudentTempHours("1");
      await fetchTemporaryCards();
    } catch {
      toast.error("Failed to assign temporary card");
    } finally {
      setStudentAssigning(false);
    }
  };

  const handleCreateGuestCard = async () => {
    const durationHours = parseInt(guestHours, 10);
    if (!guestName.trim()) {
      toast.error("Guest name is required");
      return;
    }
    if (!guestCardId.trim()) {
      toast.error("Guest temporary RFID card id is required");
      return;
    }
    if (Number.isNaN(durationHours) || durationHours < 1 || durationHours > 120) {
      toast.error("Guest duration must be between 1 and 120 hours (5 days)");
      return;
    }

    setGuestCreating(true);
    try {
      const res = await fetch("/api/operator/guest-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          temporaryRfidCardId: guestCardId.trim(),
          durationHours,
          notes: "Guest account created by operator",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create guest card");
        return;
      }

      toast.success(`Guest account created for ${data.guest.name}`);
      setGuestName("");
      setGuestCardId("");
      setGuestHours("24");
      await fetchTemporaryCards();
    } catch {
      toast.error("Failed to create guest card");
    } finally {
      setGuestCreating(false);
    }
  };

  const handleRevokeTemporaryCard = async (cardId: string) => {
    setRevokeLoadingId(cardId);
    try {
      const res = await fetch(`/api/operator/temporary-cards?id=${encodeURIComponent(cardId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to revoke temporary card");
        return;
      }
      toast.success("Temporary card revoked");
      await fetchTemporaryCards();
    } catch {
      toast.error("Failed to revoke temporary card");
    } finally {
      setRevokeLoadingId(null);
    }
  };

  const quickAmounts = [50, 100, 200, 500];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Operator Console</p>
              <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
                Wallet top-ups and temporary RFID access
              </p>
            </div>
          </div>
          <Button
            variant="outline"
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
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-4 px-4 py-4 pb-8 sm:space-y-6 sm:py-6">
        {assignedKioskDevices.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open Assigned Canteen Terminal</CardTitle>
              <CardDescription>Select device here, then continue in kiosk flow.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {assignedKioskDevices.map((device) => (
                  <Link key={device.id} href={`/kiosk?deviceCode=${encodeURIComponent(device.deviceCode)}`}>
                    <Button type="button" variant="outline" size="sm">
                      {device.deviceName} ({device.deviceCode})
                    </Button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-5 w-full justify-start overflow-y-hidden bg-muted/60">
  <TabsTrigger
    value="topup"
    className="min-w-[44px] sm:min-w-[150px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
  >
    <Wallet className="w-4 h-4 shrink-0" />
    <span className="hidden sm:inline ml-2">Top-Up</span>
  </TabsTrigger>
          <TabsTrigger
    value="student-temp"
    className="min-w-[44px] sm:min-w-[170px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
  >
    <ShieldCheck className="w-4 h-4 shrink-0" />
    <span className="hidden sm:inline ml-2">Temp Card</span>
  </TabsTrigger>
  <TabsTrigger
    value="guest"
    className="min-w-[44px] sm:min-w-[170px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
  >
    <UserPlus className="w-4 h-4 shrink-0" />
    <span className="hidden sm:inline ml-2">Guest</span>
  </TabsTrigger>
</TabsList>

          <TabsContent value="topup" className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Scan Student Card
                  </CardTitle>
                  <CardDescription>
                    Tap RFID card or type card ID. Supports permanent and active temporary cards.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    ref={rfidRef}
                    value={rfidInput}
                    onChange={(e) => setRfidInput(e.target.value)}
                    onKeyDown={handleRfidKeyDown}
                    placeholder="Waiting for card scan..."
                    className="h-12 text-center text-base font-mono tracking-[0.2em] sm:text-lg"
                    autoFocus
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    onClick={() => void lookupCard(rfidInput)}
                    disabled={loading || !rfidInput.trim()}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Lookup Card
                  </Button>
                  {loading && (
                    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Looking up card...
                    </p>
                  )}
                </CardContent>
              </Card>

              {childInfo ? (
                <Card className="border-emerald-200">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <User className="h-5 w-5 text-emerald-600" />
                        {childInfo.name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {childInfo.className || "-"}
                          {childInfo.section ? `-${childInfo.section}` : ""}
                        </Badge>
                        {childInfo.cardSource === "TEMPORARY" ? (
                          <Badge className="bg-amber-100 text-amber-800">Temp Card</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800">Permanent Card</Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>GR: {childInfo.grNumber || "-"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl bg-muted p-4 text-center">
                      <p className="text-xs text-muted-foreground">Current Balance</p>
                      <p className="mt-1 text-3xl font-bold text-primary">Rs{childInfo.walletBalance.toFixed(2)}</p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="amount">Top-Up Amount (Rs)</Label>
                      <Input
                        id="amount"
                        type="number"
                        min="1"
                        max="5000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount"
                        className="h-11 text-base"
                      />
                      <div className="grid grid-cols-4 gap-2">
                        {quickAmounts.map((quickAmount) => (
                          <Button
                            key={quickAmount}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={() => setAmount(quickAmount.toString())}
                          >
                            Rs{quickAmount}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={handleTopup}
                        disabled={topupLoading || !amount}
                        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {topupLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <IndianRupee className="mr-2 h-4 w-4" />
                        )}
                        Add Rs{amount || "0"}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setChildInfo(null);
                          setRfidInput("");
                          setAmount("");
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                    <CreditCard className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Ready for scan</p>
                    <p className="text-xs text-muted-foreground">
                      Scan a student RFID card to open wallet top-up controls.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {lastTopup && (
              <Card className="border-emerald-300 bg-emerald-50/60">
                <CardContent className="py-5 text-center">
                  <CheckCircle className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
                  <p className="text-lg font-semibold">Top-up Successful</p>
                  <p className="text-sm text-muted-foreground">
                    Added Rs{lastTopup.amount} to {lastTopup.childName}
                  </p>
                  <p className="mt-1 text-xl font-bold text-primary">
                    New Balance: Rs{lastTopup.newBalance.toFixed(2)}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
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
          </TabsContent>

          <TabsContent value="student-temp" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Assign Temporary Access Card
                </CardTitle>
                <CardDescription>
                  For student and general accounts who forgot permanent cards. Duration: 1 to 48 hours.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Scan Existing Permanent Card</Label>
                  <Input
                    ref={studentLookupRef}
                    value={studentLookupCard}
                    onChange={(e) => setStudentLookupCard(e.target.value)}
                    placeholder="Permanent RFID card ID"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void lookupStudentForTempCard(studentLookupCard);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void lookupStudentForTempCard(studentLookupCard)}
                    disabled={studentLookupLoading || !studentLookupCard.trim()}
                  >
                    {studentLookupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Find Account
                  </Button>
                </div>

                {studentTarget ? (
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="font-medium">{studentTarget.name}</p>
                    <p className="text-xs text-muted-foreground">
                      GR: {studentTarget.grNumber || "-"} • {studentTarget.className || "-"}
                      {studentTarget.section ? `-${studentTarget.section}` : ""}
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Temporary Card ID</Label>
                        <Input
                          value={studentTempCardId}
                          onChange={(e) => setStudentTempCardId(e.target.value)}
                          placeholder="TEMP-CARD-123"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valid For (Hours)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="48"
                          value={studentTempHours}
                          onChange={(e) => setStudentTempHours(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={handleAssignStudentTempCard}
                      disabled={studentAssigning}
                    >
                      {studentAssigning ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Clock3 className="mr-2 h-4 w-4" />
                      )}
                      Assign Temporary Access Card
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <TemporaryCardsPanel
              cards={temporaryCards}
              loading={cardsLoading}
              revokeLoadingId={revokeLoadingId}
              onRevoke={handleRevokeTemporaryCard}
            />
          </TabsContent>

          <TabsContent value="guest" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Create Guest Account + Assign RFID
                </CardTitle>
                <CardDescription>
                  Creates a GENERAL guest account and temporary card access. Max validity: 5 days.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Guest Name</Label>
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Guest full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Guest RFID Card ID</Label>
                  <Input
                    value={guestCardId}
                    onChange={(e) => setGuestCardId(e.target.value)}
                    placeholder="GUEST-CARD-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid For (Hours)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    value={guestHours}
                    onChange={(e) => setGuestHours(e.target.value)}
                  />
                </div>

                <div className="rounded-lg border border-dashed border-primary/40 p-3 text-xs text-muted-foreground">
                  New guest accounts are created with role GENERAL and class label GENERAL_ACCOUNT.
                </div>

                <Button
                  type="button"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleCreateGuestCard}
                  disabled={guestCreating}
                >
                  {guestCreating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Create Guest + Assign Card
                </Button>
              </CardContent>
            </Card>

            <TemporaryCardsPanel
              cards={temporaryCards}
              loading={cardsLoading}
              revokeLoadingId={revokeLoadingId}
              onRevoke={handleRevokeTemporaryCard}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function TemporaryCardsPanel({
  cards,
  loading,
  revokeLoadingId,
  onRevoke,
}: {
  cards: TemporaryCardRecord[];
  loading: boolean;
  revokeLoadingId: string | null;
  onRevoke: (cardId: string) => void;
}) {
  const activeCards = cards.filter((card) => card.isActive);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          Active Temporary Cards
        </CardTitle>
        <CardDescription>Student/general temporary cards and guest cards</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading cards...
          </div>
        ) : activeCards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active temporary cards.</p>
        ) : (
          <div className="space-y-2.5">
            {activeCards.map((card) => (
              <div
                key={card.id}
                className="rounded-xl border border-primary/20 bg-primary/5 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{card.childName}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.className || "-"}
                      {card.section ? `-${card.section}` : ""}
                    </p>
                    <p className="font-mono text-xs">RFID: {card.temporaryRfidCardId}</p>
                    <p className="text-xs text-muted-foreground">
                      Valid until: {formatDateTime(card.validUntil)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        card.accessType === "GUEST_TEMP"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-emerald-100 text-emerald-800",
                      )}
                    >
                      {card.accessType === "GUEST_TEMP" ? "Guest" : "Student Temp"}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => onRevoke(card.id)}
                      disabled={revokeLoadingId === card.id}
                    >
                      {revokeLoadingId === card.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
