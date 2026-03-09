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
  User,
  Search,
  CheckCircle,
  Loader2,
  LogOut,
  NfcIcon,
  Users,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  parentName: string;
};

export default function ManagementCardsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [searchResults, setSearchResults] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  const rfidRef = useRef<HTMLInputElement>(null);

  // When scan mode is activated, auto-focus the RFID input
  useEffect(() => {
    if (scanMode) {
      rfidRef.current?.focus();
    }
  }, [scanMode]);

  // Search children
  const handleSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 3) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    setSelectedChild(null);
    try {
      const res = await fetch(
        `/api/management/children?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        toast.error("Search failed");
        return;
      }
      const data = await res.json();
      setSearchResults(data);
      if (data.length === 0) toast.info("No children found");
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search with debounce when 3+ characters are typed
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // Handle RFID scan
  const handleRfidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      assignCard(rfidInput);
    }
  };

  // Assign card to child
  const assignCard = async (cardId: string) => {
    if (!selectedChild || !cardId.trim()) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/management/assign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: selectedChild.id,
          rfidCardId: cardId.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to assign card");
        return;
      }
      toast.success(`Card assigned to ${selectedChild.name}`);
      setSelectedChild({ ...selectedChild, rfidCardId: cardId.trim() });
      setScanMode(false);
      setRfidInput("");
    } catch {
      toast.error("Failed to assign card");
    } finally {
      setAssigning(false);
    }
  };

  // Unlink card
  const handleUnlink = async () => {
    if (!selectedChild) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/management/assign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChild.id, rfidCardId: null }),
      });
      if (!res.ok) {
        toast.error("Failed to unlink card");
        return;
      }
      toast.success("Card unlinked");
      setSelectedChild({ ...selectedChild, rfidCardId: null });
    } catch {
      toast.error("Failed to unlink card");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-[#1a3a8f]/5 to-background">
      {/* Header bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <NfcIcon className="h-5 w-5 text-[#1a3a8f]" />
            <span className="font-bold text-lg">
              Management — Card Assignment
            </span>
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

      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#1a3a8f]" />
              Search Student
            </CardTitle>
            <CardDescription>
              Search by student name, GR number, or parent name
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleSearch(searchQuery)
                }
                placeholder="Type 3+ characters to search..."
              />
              <Button
                onClick={() => handleSearch(searchQuery)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {searchResults.map((child) => (
                <button
                  key={child.id}
                  onClick={() => {
                    setSelectedChild(child);
                    setScanMode(false);
                    setRfidInput("");
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedChild?.id === child.id
                      ? "border-[#1a3a8f] bg-[#1a3a8f]/5"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{child.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {child.className}
                        {child.section ? ` — ${child.section}` : ""} • Parent:{" "}
                        {child.parentName}
                      </p>
                      {child.grNumber && (
                        <p className="text-xs text-muted-foreground">
                          GR: {child.grNumber}
                        </p>
                      )}
                    </div>
                    {child.rfidCardId ? (
                      <Badge className="bg-[#2eab57]/15 text-[#1e7a3c]">
                        <CreditCard className="h-3 w-3 mr-1" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        No Card
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Selected Child — Card Assignment */}
        {selectedChild && (
          <Card className="border-[#1a3a8f]/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-[#1a3a8f]" />
                {selectedChild.name}
              </CardTitle>
              <CardDescription>
                {selectedChild.className}
                {selectedChild.section ? ` — ${selectedChild.section}` : ""} •
                GR: {selectedChild.grNumber || "N/A"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedChild.rfidCardId ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-[#2eab57]/5 p-4 text-center">
                    <CreditCard className="h-8 w-8 text-[#2eab57] mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Current Card ID
                    </p>
                    <p className="text-lg font-mono font-bold">
                      {selectedChild.rfidCardId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setScanMode(true);
                        setRfidInput("");
                      }}
                    >
                      Replace Card
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleUnlink}
                      disabled={assigning}
                    >
                      Unlink Card
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground mb-3">No card assigned</p>
                  <Button
                    className="bg-[#1a3a8f] hover:bg-[#15307a]"
                    onClick={() => {
                      setScanMode(true);
                      setRfidInput("");
                    }}
                  >
                    Assign Card
                  </Button>
                </div>
              )}

              {/* Scan Mode */}
              {scanMode && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Scan the RFID card now</Label>
                    <Input
                      ref={rfidRef}
                      value={rfidInput}
                      onChange={(e) => setRfidInput(e.target.value)}
                      onKeyDown={handleRfidKeyDown}
                      placeholder="Waiting for card scan..."
                      className="text-center text-lg font-mono tracking-widest"
                      autoFocus
                      disabled={assigning}
                    />
                    {assigning && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Assigning...
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setScanMode(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
