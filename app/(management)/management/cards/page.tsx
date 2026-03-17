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
  NfcIcon,
  Users,
  ArrowRight,
  ListOrdered,
  X,
  ChevronRight,
} from "lucide-react";

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  parentName: string;
};

type ClassOption = { className: string; section: string | null };

// ─── Sequential Assignment Mode ──────────────────────────

function SequentialAssignment() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [queue, setQueue] = useState<ChildInfo[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [started, setStarted] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [lastAssigned, setLastAssigned] = useState<string | null>(null); // name of last assigned
  const rfidRef = useRef<HTMLInputElement>(null);
  const [rfidInput, setRfidInput] = useState("");

  // Fetch distinct classes on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/management/children?classes=true");
        if (res.ok) setClasses(await res.json());
      } catch { /* ignore */ } finally {
        setLoadingClasses(false);
      }
    })();
  }, []);

  // Get unique class names
  const uniqueClasses = [...new Set(classes.map((c) => c.className))];

  // Get sections for selected class
  const sectionsForClass = selectedClass
    ? classes.filter((c) => c.className === selectedClass).map((c) => c.section)
    : [];

  // Load students when class selected and "Start" pressed
  const startAssignment = async () => {
    if (!selectedClass) return;
    setLoadingQueue(true);
    try {
      const params = new URLSearchParams({
        class: selectedClass,
        noCard: "true",
      });
      if (selectedSection) params.set("section", selectedSection);
      const res = await fetch(`/api/management/children?${params}`);
      if (!res.ok) { toast.error("Failed to load students"); return; }
      const data: ChildInfo[] = await res.json();
      if (data.length === 0) {
        toast.info("All students in this class already have cards");
        return;
      }
      setQueue(data);
      setCurrentIdx(0);
      setStarted(true);
      setLastAssigned(null);
    } catch { toast.error("Failed to load students"); } finally {
      setLoadingQueue(false);
    }
  };

  // Auto-focus rfid input when current student changes
  useEffect(() => {
    if (started && currentIdx < queue.length) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => rfidRef.current?.focus());
    }
  }, [started, currentIdx, queue.length]);

  const current = started && currentIdx < queue.length ? queue[currentIdx] : null;
  const done = started && currentIdx >= queue.length;
  const assignedCount = currentIdx;

  // Handle card tap (Enter from RFID reader)
  const handleTap = async () => {
    const cardId = rfidInput.trim();
    if (!current || !cardId || assigning) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/management/assign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: current.id, rfidCardId: cardId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to assign card");
        setRfidInput("");
        rfidRef.current?.focus();
        return;
      }
      // Success — show green tick briefly, move to next
      setLastAssigned(current.name);
      setRfidInput("");
      setCurrentIdx((i) => i + 1);
    } catch {
      toast.error("Failed to assign card");
      setRfidInput("");
      rfidRef.current?.focus();
    } finally {
      setAssigning(false);
    }
  };

  // Reset
  const handleStop = () => {
    setStarted(false);
    setQueue([]);
    setCurrentIdx(0);
    setLastAssigned(null);
    setRfidInput("");
  };

  // ── Not started: class selection ──
  if (!started) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-[#d4891a]" />
            Sequential Card Assignment
          </CardTitle>
          <CardDescription>
            Select a class, then tap cards one by one for each student
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingClasses ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading classes...
            </div>
          ) : uniqueClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes found. Upload students first.</p>
          ) : (
            <>
              <div>
                <Label className="mb-2 block text-sm">Class</Label>
                <div className="flex flex-wrap gap-2">
                  {uniqueClasses.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setSelectedClass(c);
                        setSelectedSection(null);
                      }}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        selectedClass === c
                          ? "border-[#d4891a] bg-[#d4891a] text-white"
                          : "hover:bg-muted"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {selectedClass && sectionsForClass.length > 1 && (
                <div>
                  <Label className="mb-2 block text-sm">Section (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedSection(null)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        !selectedSection ? "border-[#d4891a] bg-[#d4891a] text-white" : "hover:bg-muted"
                      }`}
                    >
                      All
                    </button>
                    {sectionsForClass.filter(Boolean).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSection(s)}
                        className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                          selectedSection === s
                            ? "border-[#d4891a] bg-[#d4891a] text-white"
                            : "hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedClass && (
                <Button
                  className="w-full bg-[#d4891a] hover:bg-[#b87314]"
                  onClick={startAssignment}
                  disabled={loadingQueue}
                >
                  {loadingQueue ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  {loadingQueue ? "Loading..." : `Start — ${selectedClass}${selectedSection ? ` ${selectedSection}` : ""}`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Done ──
  if (done) {
    return (
      <Card className="border-[#2eab57]/30">
        <CardContent className="py-10 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-[#2eab57] mx-auto" />
          <p className="text-xl font-bold">All Done!</p>
          <p className="text-muted-foreground">
            {assignedCount} card{assignedCount !== 1 ? "s" : ""} assigned for{" "}
            {selectedClass}{selectedSection ? ` ${selectedSection}` : ""}
          </p>
          <Button variant="outline" onClick={handleStop}>
            Back to Class Selection
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Active: show current student + scan input ──
  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{selectedClass}{selectedSection ? ` ${selectedSection}` : ""}</span>
        <span>{assignedCount} / {queue.length} assigned</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className="bg-[#2eab57] h-1.5 rounded-full transition-all duration-200"
          style={{ width: `${(assignedCount / queue.length) * 100}%` }}
        />
      </div>

      {/* Last assigned tick */}
      {lastAssigned && (
        <div className="flex items-center gap-2 text-sm text-[#2eab57] font-medium animate-in fade-in duration-150">
          <CheckCircle className="h-4 w-4" />
          {lastAssigned} — done
        </div>
      )}

      {/* Current student */}
      <Card className="border-[#d4891a]/40">
        <CardContent className="py-6">
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold">{current!.name}</p>
            <p className="text-muted-foreground">
              GR: {current!.grNumber || "N/A"} • {current!.className}
              {current!.section ? ` — ${current!.section}` : ""}
            </p>
          </div>

          <div className="mt-6">
            <Input
              ref={rfidRef}
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleTap(); }
              }}
              placeholder="Tap card..."
              className="text-center text-lg font-mono tracking-widest h-12"
              autoFocus
              disabled={assigning}
            />
          </div>

          {assigning && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Assigning...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skip / Stop */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => {
            setCurrentIdx((i) => i + 1);
            setRfidInput("");
            setLastAssigned(null);
          }}
        >
          Skip <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive"
          onClick={handleStop}
        >
          <X className="h-4 w-4 mr-1" /> Stop
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function ManagementCardsPage() {
  const [mode, setMode] = useState<"individual" | "sequential">("individual");
  const [searchQuery, setSearchQuery] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [searchResults, setSearchResults] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  const rfidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanMode) rfidRef.current?.focus();
  }, [scanMode]);

  const handleSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 3) { setSearchResults([]); return; }
    setLoading(true);
    setSelectedChild(null);
    try {
      const res = await fetch(`/api/management/children?q=${encodeURIComponent(q)}`);
      if (!res.ok) { toast.error("Search failed"); return; }
      const data = await res.json();
      setSearchResults(data);
      if (data.length === 0) toast.info("No children found");
    } catch { toast.error("Search failed"); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 3) { setSearchResults([]); return; }
    const timer = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleRfidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); assignCard(rfidInput); }
  };

  const assignCard = async (cardId: string) => {
    if (!selectedChild || !cardId.trim()) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/management/assign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChild.id, rfidCardId: cardId.trim() }),
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
    } catch { toast.error("Failed to assign card"); } finally { setAssigning(false); }
  };

  const handleUnlink = async () => {
    if (!selectedChild) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/management/assign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChild.id, rfidCardId: null }),
      });
      if (!res.ok) { toast.error("Failed to unlink card"); return; }
      toast.success("Card unlinked");
      setSelectedChild({ ...selectedChild, rfidCardId: null });
    } catch { toast.error("Failed to unlink card"); } finally { setAssigning(false); }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Mode Tabs */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          onClick={() => setMode("individual")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === "individual"
              ? "bg-[#d4891a] text-white"
              : "hover:bg-muted"
          }`}
        >
          <Search className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Individual
        </button>
        <button
          onClick={() => setMode("sequential")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === "sequential"
              ? "bg-[#d4891a] text-white"
              : "hover:bg-muted"
          }`}
        >
          <ListOrdered className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Sequential (by Class)
        </button>
      </div>

      {mode === "sequential" ? (
        <SequentialAssignment />
      ) : (
        <>
          {/* Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#d4891a]" />
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
                  onKeyDown={(e) => e.key === "Enter" && handleSearch(searchQuery)}
                  placeholder="Type 3+ characters to search..."
                />
                <Button onClick={() => handleSearch(searchQuery)} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
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
                        ? "border-[#d4891a] bg-[#d4891a]/5"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{child.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {child.className}
                          {child.section ? ` — ${child.section}` : ""} • Parent: {child.parentName}
                        </p>
                        {child.grNumber && (
                          <p className="text-xs text-muted-foreground">GR: {child.grNumber}</p>
                        )}
                      </div>
                      {child.rfidCardId ? (
                        <Badge className="bg-[#2eab57]/15 text-[#1e7a3c]">
                          <CreditCard className="h-3 w-3 mr-1" />
                          Linked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">No Card</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Selected Child — Card Assignment */}
          {selectedChild && (
            <Card className="border-[#d4891a]/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-[#d4891a]" />
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
                      <p className="text-sm text-muted-foreground">Current Card ID</p>
                      <p className="text-lg font-mono font-bold">{selectedChild.rfidCardId}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setScanMode(true); setRfidInput(""); }}
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
                      className="bg-[#d4891a] hover:bg-[#b87314]"
                      onClick={() => { setScanMode(true); setRfidInput(""); }}
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
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => setScanMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
