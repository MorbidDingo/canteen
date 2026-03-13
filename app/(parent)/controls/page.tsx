"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield,
  Loader2,
  Save,
  X,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Search,
  Clock,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  type MenuCategory,
  BOOK_CATEGORIES,
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  category: string;
};

type ChildControl = {
  childId: string;
  childName: string;
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
  blockedCategories: string[];
  blockedItemIds: string[];
  blockedBookCategories: string[];
  blockedBookAuthors: string[];
  blockedBookIds: string[];
  blockedBooks?: LibraryBook[];
  preIssueBookId: string | null;
  preIssueExpiresAt: string | null;
  preIssueDeclinedUntil: string | null;
  preIssueBook?: LibraryBook | null;
};

const ALL_CATEGORIES: MenuCategory[] = [
  "SNACKS",
  "MEALS",
  "DRINKS",
  "PACKED_FOOD",
];

const ALL_BOOK_CATEGORIES: BookCategory[] = [
  BOOK_CATEGORIES.FICTION,
  BOOK_CATEGORIES.NON_FICTION,
  BOOK_CATEGORIES.TEXTBOOK,
  BOOK_CATEGORIES.REFERENCE,
  BOOK_CATEGORIES.PERIODICAL,
  BOOK_CATEGORIES.GENERAL,
];

type ControlMode = "canteen" | "library";

export default function ControlsPage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildControl[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [controlMode, setControlMode] = useState<ControlMode>("canteen");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Canteen controls
  const [dailyLimit, setDailyLimit] = useState("");
  const [orderLimit, setOrderLimit] = useState("");
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);

  // Library controls
  const [blockedBookCategories, setBlockedBookCategories] = useState<string[]>([]);
  const [blockedBookAuthors, setBlockedBookAuthors] = useState<string[]>([]);
  const [authorInput, setAuthorInput] = useState("");
  const [blockedBooks, setBlockedBooks] = useState<LibraryBook[]>([]);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [bookSearchResults, setBookSearchResults] = useState<LibraryBook[]>([]);
  const [bookSearchLoading, setBookSearchLoading] = useState(false);

  const [preIssueBook, setPreIssueBook] = useState<LibraryBook | null>(null);
  const [preIssueSearchQuery, setPreIssueSearchQuery] = useState("");
  const [preIssueResults, setPreIssueResults] = useState<LibraryBook[]>([]);
  const [preIssueSearchLoading, setPreIssueSearchLoading] = useState(false);
  const [preIssueExpiresAt, setPreIssueExpiresAt] = useState<string | null>(null);
  const [preIssueDeclinedUntil, setPreIssueDeclinedUntil] = useState<string | null>(null);

  const fetchControls = useCallback(async () => {
    try {
      const res = await fetch("/api/controls");
      if (!res.ok) throw new Error();
      const data: ChildControl[] = await res.json();
      setChildren(data);
      if (data.length > 0 && !selectedChildId) {
        setSelectedChildId(data[0].childId);
        populateForm(data[0]);
      }
    } catch {
      toast.error("Failed to load controls");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  const populateForm = (ctrl: ChildControl) => {
    setDailyLimit(ctrl.dailySpendLimit?.toString() || "");
    setOrderLimit(ctrl.perOrderLimit?.toString() || "");
    setBlockedCategories(ctrl.blockedCategories || []);

    setBlockedBookCategories(ctrl.blockedBookCategories || []);
    setBlockedBookAuthors(ctrl.blockedBookAuthors || []);
    setBlockedBooks(ctrl.blockedBooks || []);
    setPreIssueBook(ctrl.preIssueBook || null);
    setPreIssueExpiresAt(ctrl.preIssueExpiresAt || null);
    setPreIssueDeclinedUntil(ctrl.preIssueDeclinedUntil || null);

    setAuthorInput("");
    setBookSearchQuery("");
    setBookSearchResults([]);
    setPreIssueSearchQuery("");
    setPreIssueResults([]);
  };

  const searchBooks = useCallback(async (query: string, setLoadingState: (v: boolean) => void) => {
    if (query.trim().length < 2) return [];
    setLoadingState(true);
    try {
      const res = await fetch(`/api/library/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!data.success) return [];
      return (data.books || []) as LibraryBook[];
    } catch {
      return [];
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  useEffect(() => {
    const ctrl = children.find((c) => c.childId === selectedChildId);
    if (ctrl) populateForm(ctrl);
  }, [selectedChildId, children]);

  useEffect(() => {
    if (controlMode !== "library") return;
    const t = setTimeout(async () => {
      if (bookSearchQuery.trim().length < 2) {
        setBookSearchResults([]);
        return;
      }
      const books = await searchBooks(bookSearchQuery, setBookSearchLoading);
      setBookSearchResults(books);
    }, 250);
    return () => clearTimeout(t);
  }, [bookSearchQuery, controlMode, searchBooks]);

  useEffect(() => {
    if (controlMode !== "library") return;
    const t = setTimeout(async () => {
      if (preIssueSearchQuery.trim().length < 2) {
        setPreIssueResults([]);
        return;
      }
      const books = await searchBooks(preIssueSearchQuery, setPreIssueSearchLoading);
      setPreIssueResults(books);
    }, 250);
    return () => clearTimeout(t);
  }, [preIssueSearchQuery, controlMode, searchBooks]);

  const toggleCategory = (cat: string) => {
    setBlockedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const toggleBookCategory = (cat: string) => {
    setBlockedBookCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const addAuthor = () => {
    const author = authorInput.trim();
    if (!author) return;
    const exists = blockedBookAuthors.some((a) => a.toLowerCase() === author.toLowerCase());
    if (!exists) {
      setBlockedBookAuthors((prev) => [...prev, author]);
    }
    setAuthorInput("");
  };

  const removeAuthor = (author: string) => {
    setBlockedBookAuthors((prev) => prev.filter((a) => a !== author));
  };

  const addBlockedBook = (selected: LibraryBook) => {
    setBlockedBooks((prev) => {
      if (prev.some((b) => b.id === selected.id)) return prev;
      return [...prev, selected];
    });
  };

  const removeBlockedBook = (bookId: string) => {
    setBlockedBooks((prev) => prev.filter((b) => b.id !== bookId));
  };

  const handleSave = async () => {
    if (!selectedChildId) {
      toast.error("Select a child first");
      return;
    }

    setSaving(true);
    try {
      const payload =
        controlMode === "library"
          ? {
              childId: selectedChildId,
              blockedBookCategories,
              blockedBookAuthors,
              blockedBookIds: blockedBooks.map((b) => b.id),
              preIssueBookId: preIssueBook?.id ?? null,
            }
          : {
              childId: selectedChildId,
              dailySpendLimit: dailyLimit ? parseFloat(dailyLimit) : null,
              perOrderLimit: orderLimit ? parseFloat(orderLimit) : null,
              blockedCategories,
            };

      const res = await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to save");
        return;
      }

      toast.success(
        controlMode === "library" ? "Library controls saved!" : "Canteen controls saved!",
      );
      setLoading(true);
      await fetchControls();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-6 space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-1.5"
          onClick={() => router.push("/settings")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>

        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No children found. Add a child first to set controls.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-6 space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit gap-1.5"
        onClick={() => router.push("/settings")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-[#1a3a8f]" />
          Controls
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage canteen and library restrictions for your child
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border p-1">
        <Button
          type="button"
          variant={controlMode === "canteen" ? "default" : "ghost"}
          className="gap-2"
          onClick={() => setControlMode("canteen")}
        >
          <Shield className="h-4 w-4" />
          Canteen
        </Button>
        <Button
          type="button"
          variant={controlMode === "library" ? "default" : "ghost"}
          className="gap-2"
          onClick={() => setControlMode("library")}
        >
          <BookOpen className="h-4 w-4" />
          Library
        </Button>
      </div>

      {children.length > 1 && (
        <Select value={selectedChildId} onValueChange={setSelectedChildId}>
          <SelectTrigger>
            <SelectValue placeholder="Select child" />
          </SelectTrigger>
          <SelectContent>
            {children.map((c) => (
              <SelectItem key={c.childId} value={c.childId}>
                {c.childName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {controlMode === "canteen" ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Spending Limits</CardTitle>
              <CardDescription>Leave empty for no limit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dailyLimit">Daily Spend Limit (₹)</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  min="0"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="e.g. 200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderLimit">Per-Order Limit (₹)</Label>
                <Input
                  id="orderLimit"
                  type="number"
                  min="0"
                  value={orderLimit}
                  onChange={(e) => setOrderLimit(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#f58220]" />
                Blocked Categories
              </CardTitle>
              <CardDescription>
                Child will not be able to order from blocked categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {ALL_CATEGORIES.map((cat) => {
                  const isBlocked = blockedCategories.includes(cat);
                  return (
                    <Button
                      key={cat}
                      type="button"
                      variant={isBlocked ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => toggleCategory(cat)}
                      className="gap-1"
                    >
                      {isBlocked && <X className="h-3 w-3" />}
                      {MENU_CATEGORY_LABELS[cat]}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {preIssueDeclinedUntil && new Date(preIssueDeclinedUntil) > new Date() && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="pt-4 text-sm text-amber-900">
                Child declined pre-issue. Next pre-issue can be requested after{" "}
                <span className="font-semibold">
                  {new Date(preIssueDeclinedUntil).toLocaleString("en-IN")}
                </span>
                .
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Blocked Book Categories</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ALL_BOOK_CATEGORIES.map((cat) => {
                const isBlocked = blockedBookCategories.includes(cat);
                return (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={isBlocked ? "destructive" : "outline"}
                    onClick={() => toggleBookCategory(cat)}
                  >
                    {BOOK_CATEGORY_LABELS[cat]}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Blocked Authors</CardTitle>
              <CardDescription>Add author names to block all their books</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={authorInput}
                  onChange={(e) => setAuthorInput(e.target.value)}
                  placeholder="Type author name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAuthor();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addAuthor}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {blockedBookAuthors.map((author) => (
                  <Badge key={author} variant="secondary" className="gap-1">
                    {author}
                    <button
                      type="button"
                      className="ml-1"
                      onClick={() => removeAuthor(author)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Blocked Books (Search)</CardTitle>
              <CardDescription>
                Search by title, author, or ISBN and block specific books
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  placeholder="Search books to block"
                  className="pl-9"
                />
              </div>
              {bookSearchLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : (
                bookSearchQuery.length >= 2 && (
                  <div className="space-y-2 max-h-52 overflow-auto">
                    {bookSearchResults.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted/40"
                        onClick={() => addBlockedBook(b)}
                      >
                        <p className="text-sm font-medium">{b.title}</p>
                        <p className="text-xs text-muted-foreground">{b.author}</p>
                      </button>
                    ))}
                    {bookSearchResults.length === 0 && (
                      <p className="text-xs text-muted-foreground">No books found</p>
                    )}
                  </div>
                )
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Currently Blocked Books</p>
                {blockedBooks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No specific books blocked</p>
                ) : (
                  <div className="space-y-2">
                    {blockedBooks.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{b.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeBlockedBook(b.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pre-Issue Request (12 hours)</CardTitle>
              <CardDescription>
                Request one book in advance. Child will get a yes/no prompt at library counter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={preIssueSearchQuery}
                  onChange={(e) => setPreIssueSearchQuery(e.target.value)}
                  placeholder="Search book for pre-issue"
                  className="pl-9"
                />
              </div>

              {preIssueSearchLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : (
                preIssueSearchQuery.length >= 2 && (
                  <div className="space-y-2 max-h-44 overflow-auto">
                    {preIssueResults.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted/40"
                        onClick={() => setPreIssueBook(b)}
                      >
                        <p className="text-sm font-medium">{b.title}</p>
                        <p className="text-xs text-muted-foreground">{b.author}</p>
                      </button>
                    ))}
                    {preIssueResults.length === 0 && (
                      <p className="text-xs text-muted-foreground">No books found</p>
                    )}
                  </div>
                )
              )}

              {preIssueBook ? (
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-sm font-medium">Selected: {preIssueBook.title}</p>
                  <p className="text-xs text-muted-foreground">{preIssueBook.author}</p>
                  {preIssueExpiresAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Expires at {new Date(preIssueExpiresAt).toLocaleString("en-IN")}
                    </p>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPreIssueBook(null)}>
                    Clear request
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No pre-issue request selected</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Save {controlMode === "library" ? "Library" : "Canteen"} Controls
      </Button>
    </div>
  );
}
