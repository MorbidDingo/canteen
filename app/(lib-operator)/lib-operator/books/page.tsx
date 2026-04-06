"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  X,
  MapPin,
} from "lucide-react";
import {
  BOOK_CATEGORY_LABELS,
  BOOK_COPY_STATUS_LABELS,
  BOOK_COPY_CONDITION_LABELS,
  type BookCopyStatus,
  type BookCopyCondition,
} from "@/lib/constants";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

interface Book {
  id: string;
  libraryId: string | null;
  libraryName: string | null;
  libraryLocation: string | null;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  edition: string | null;
  category: string;
  description: string | null;
  totalCopies: number;
  availableCopies: number;
  createdAt: string;
}

interface BookCopyData {
  id: string;
  bookId: string;
  accessionNumber: string;
  condition: string;
  status: string;
  location: string | null;
  createdAt: string;
}

export default function LibOperatorBooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formISBN, setFormISBN] = useState("");
  const [formPublisher, setFormPublisher] = useState("");
  const [formEdition, setFormEdition] = useState("");
  const [formCategory, setFormCategory] = useState<string>("GENERAL");
  const [formQuantity, setFormQuantity] = useState("0");
  const [formDescription, setFormDescription] = useState("");

  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [copies, setCopies] = useState<BookCopyData[]>([]);
  const [copiesLoading, setCopiesLoading] = useState(false);

  const [addCopyOpen, setAddCopyOpen] = useState(false);
  const [copyAccession, setCopyAccession] = useState("");
  const [copyCondition, setCopyCondition] = useState<string>("NEW");
  const [copyLocation, setCopyLocation] = useState("");
  const [addingCopy, setAddingCopy] = useState(false);

  const [editingCopyId, setEditingCopyId] = useState<string | null>(null);
  const [editCondition, setEditCondition] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [savingCopy, setSavingCopy] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [retiringCopy, setRetiringCopy] = useState<string | null>(null);
  const {
    value: selectedLibrary,
    setValue: setSelectedLibrary,
    hydrated: libraryScopeHydrated,
  } = usePersistedSelection("certe:selected-library-id");

  const formatCategoryLabel = useCallback((category: string) => {
    if (!category) return "General";
    if (BOOK_CATEGORY_LABELS[category]) return BOOK_CATEGORY_LABELS[category];
    return category
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, []);

  // ─── Fetch books ───────────────────────────────────────

  const fetchBooks = useCallback(
    async (q?: string, cat?: string, p?: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (q && q.length >= 2) params.set("q", q);
        if (cat && cat !== "ALL") params.set("category", cat);
        if (selectedLibrary) params.set("libraryId", selectedLibrary);
        params.set("page", String(p || 1));
        params.set("limit", "30");

        const res = await fetch(`/api/management/library/books?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setBooks(data.books);
        const nextCategories = Array.isArray(data.categories)
          ? data.categories.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
          : Array.from(new Set((data.books as Book[]).map((item) => item.category).filter(Boolean)));
        setCategories(nextCategories);
        setTotalPages(data.pagination.totalPages);
      } catch {
        toast.error("Failed to load books");
      } finally {
        setLoading(false);
      }
    },
    [selectedLibrary],
  );

  useEffect(() => {
    if (!libraryScopeHydrated) return;
    fetchBooks();
  }, [fetchBooks, libraryScopeHydrated]);

  useEffect(() => {
    if (!libraryScopeHydrated) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchBooks(searchQuery, categoryFilter, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, categoryFilter, fetchBooks, libraryScopeHydrated]);

  // ─── Book CRUD ─────────────────────────────────────────

  function openCreateDialog() {
    setEditingBook(null);
    setFormTitle("");
    setFormAuthor("");
    setFormISBN("");
    setFormPublisher("");
    setFormEdition("");
    setFormCategory("GENERAL");
    setFormQuantity("0");
    setFormDescription("");
    setDialogOpen(true);
  }

  function openEditDialog(b: Book) {
    setEditingBook(b);
    setFormTitle(b.title);
    setFormAuthor(b.author);
    setFormISBN(b.isbn || "");
    setFormPublisher(b.publisher || "");
    setFormEdition(b.edition || "");
    setFormCategory(b.category);
    setFormQuantity(String(b.availableCopies));
    setFormDescription(b.description || "");
    setDialogOpen(true);
  }

  async function handleSaveBook() {
    if (!formTitle.trim() || !formAuthor.trim()) {
      toast.error("Title and author are required");
      return;
    }

    if (!selectedLibrary) {
      toast.error("Select a library first");
      return;
    }

    const parsedQuantity = Number.parseInt(formQuantity, 10);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      toast.error("Quantity must be 0 or more");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formTitle,
        author: formAuthor,
        isbn: formISBN || null,
        publisher: formPublisher || null,
        edition: formEdition || null,
        category: formCategory.trim() || "GENERAL",
        quantity: parsedQuantity,
        description: formDescription || null,
        libraryId: selectedLibrary,
      };

      const url = editingBook
        ? `/api/management/library/books/${editingBook.id}`
        : "/api/management/library/books";
      const method = editingBook ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save book");
        return;
      }

      toast.success(editingBook ? "Book updated" : "Book created");
      setDialogOpen(false);
      fetchBooks(searchQuery, categoryFilter, page);
    } catch {
      toast.error("Failed to save book");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveBook(bookId: string) {
    if (!confirm("Archive this book? All copies will be retired.")) return;

    setDeleting(bookId);
    try {
      const res = await fetch(`/api/management/library/books/${bookId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to archive book");
        return;
      }

      toast.success("Book archived");
      fetchBooks(searchQuery, categoryFilter, page);
      if (expandedBookId === bookId) setExpandedBookId(null);
    } catch {
      toast.error("Failed to archive book");
    } finally {
      setDeleting(null);
    }
  }

  // ─── Copies ────────────────────────────────────────────

  async function toggleCopies(bookId: string) {
    if (expandedBookId === bookId) {
      setExpandedBookId(null);
      return;
    }

    setExpandedBookId(bookId);
    setCopiesLoading(true);
    try {
      const res = await fetch(
        `/api/management/library/books/${bookId}/copies`,
      );
      const data = await res.json();
      setCopies(data.copies);
    } catch {
      toast.error("Failed to load copies");
    } finally {
      setCopiesLoading(false);
    }
  }

  async function handleAddCopy() {
    if (!copyAccession.trim()) {
      toast.error("Accession number is required");
      return;
    }

    setAddingCopy(true);
    try {
      const res = await fetch(
        `/api/management/library/books/${expandedBookId}/copies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessionNumber: copyAccession,
            condition: copyCondition,
            location: copyLocation || null,
          }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to add copy");
        return;
      }

      toast.success("Copy added");
      setAddCopyOpen(false);
      setCopyAccession("");
      setCopyCondition("NEW");
      setCopyLocation("");
      const bookId = expandedBookId;
      setExpandedBookId(null);
      setTimeout(() => {
        if (bookId) toggleCopies(bookId);
        fetchBooks(searchQuery, categoryFilter, page);
      }, 100);
    } catch {
      toast.error("Failed to add copy");
    } finally {
      setAddingCopy(false);
    }
  }

  function startEditCopy(copy: BookCopyData) {
    setEditingCopyId(copy.id);
    setEditCondition(copy.condition);
    setEditLocation(copy.location || "");
    setEditStatus(copy.status);
  }

  async function handleSaveCopy(copyId: string) {
    setSavingCopy(true);
    try {
      const res = await fetch(
        `/api/management/library/books/${expandedBookId}/copies/${copyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            condition: editCondition,
            location: editLocation || null,
            status: editStatus,
          }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to update copy");
        return;
      }

      toast.success("Copy updated");
      setEditingCopyId(null);
      const copiesRes = await fetch(
        `/api/management/library/books/${expandedBookId}/copies`,
      );
      const copiesData = await copiesRes.json();
      setCopies(copiesData.copies);
      fetchBooks(searchQuery, categoryFilter, page);
    } catch {
      toast.error("Failed to update copy");
    } finally {
      setSavingCopy(false);
    }
  }

  async function handleRetireCopy(copyId: string) {
    if (!confirm("Retire this copy?")) return;

    setRetiringCopy(copyId);
    try {
      const res = await fetch(
        `/api/management/library/books/${expandedBookId}/copies/${copyId}`,
        { method: "DELETE" },
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to retire copy");
        return;
      }

      toast.success("Copy retired");
      const copiesRes = await fetch(
        `/api/management/library/books/${expandedBookId}/copies`,
      );
      const copiesData = await copiesRes.json();
      setCopies(copiesData.copies);
      fetchBooks(searchQuery, categoryFilter, page);
    } catch {
      toast.error("Failed to retire copy");
    } finally {
      setRetiringCopy(null);
    }
  }

  // ─── Render ────────────────────────────────────────────

  const categoryBadgeColor = (cat: string) => {
    const colors: Record<string, string> = {
      FICTION: "bg-purple-100 text-purple-800",
      NON_FICTION: "bg-blue-100 text-blue-800",
      TEXTBOOK: "bg-green-100 text-green-800",
      REFERENCE: "bg-orange-100 text-orange-800",
      PERIODICAL: "bg-pink-100 text-pink-800",
      GENERAL: "bg-gray-100 text-gray-800",
    };
    return colors[cat] || colors.GENERAL;
  };

  const copyStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      AVAILABLE: "bg-green-100 text-green-800",
      ISSUED: "bg-blue-100 text-blue-800",
      LOST: "bg-red-100 text-red-800",
      DAMAGED: "bg-orange-100 text-orange-800",
      RETIRED: "bg-gray-100 text-gray-500",
    };
    return colors[status] || colors.AVAILABLE;
  };

  return (
    <div className="pb-8">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-[#d4891a]/15 bg-white/70 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d4891a] shadow-sm">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Book Catalog</p>
              <p className="text-xs text-muted-foreground">Manage titles, copies, and book inventory.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-sm text-muted-foreground">
              Manage books, copies, and inventory
            </p>
            <LibrarySelector
              value={selectedLibrary}
              onChange={setSelectedLibrary}
              showAll={false}
              compact
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchBooks(searchQuery, categoryFilter, page)}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-1" /> Add Book
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingBook ? "Edit Book" : "Add New Book"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="col-span-2">
                      <Label>Title *</Label>
                      <Input
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Book title"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Author *</Label>
                      <Input
                        value={formAuthor}
                        onChange={(e) => setFormAuthor(e.target.value)}
                        placeholder="Author name"
                      />
                    </div>
                    <div>
                      <Label>ISBN</Label>
                      <Input
                        value={formISBN}
                        onChange={(e) => setFormISBN(e.target.value)}
                        placeholder="ISBN-10 or ISBN-13"
                      />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Input
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        placeholder="e.g. SCIENCE_FICTION"
                        list="lib-operator-book-categories"
                      />
                      <datalist id="lib-operator-book-categories">
                        {categories.map((item) => (
                          <option key={item} value={item} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formQuantity}
                        onChange={(e) => setFormQuantity(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Publisher</Label>
                      <Input
                        value={formPublisher}
                        onChange={(e) => setFormPublisher(e.target.value)}
                        placeholder="Publisher"
                      />
                    </div>
                    <div>
                      <Label>Edition</Label>
                      <Input
                        value={formEdition}
                        onChange={(e) => setFormEdition(e.target.value)}
                        placeholder="e.g. 3rd Edition"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Brief description..."
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveBook} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      {editingBook ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search & filter */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, author, or ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {formatCategoryLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Book list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : books.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No books found. Add your first book to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {books.map((b) => (
              <Card key={b.id} className="overflow-hidden">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{b.title}</h3>
                      <Badge
                        variant="secondary"
                        className={categoryBadgeColor(b.category)}
                      >
                        {formatCategoryLabel(b.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      by {b.author}
                      {b.publisher && ` · ${b.publisher}`}
                      {b.edition && ` · ${b.edition}`}
                    </p>
                    {b.libraryName ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {b.libraryName}
                        {b.libraryLocation ? ` · ${b.libraryLocation}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {b.isbn && (
                        <span className="font-mono">ISBN: {b.isbn}</span>
                      )}
                      <span>
                        <Copy className="inline h-3 w-3 mr-0.5" />
                        {b.totalCopies} total · {b.availableCopies} available
                      </span>
                    </div>
                  </div>
                  <div className="ml-0 flex items-center gap-1 self-end sm:ml-3 sm:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(b)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchiveBook(b.id)}
                      disabled={deleting === b.id}
                      className="text-destructive hover:text-destructive"
                    >
                      {deleting === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCopies(b.id)}
                    >
                      {expandedBookId === b.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded copies view */}
                {expandedBookId === b.id && (
                  <div className="border-t bg-muted/30 p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="font-medium text-sm">
                        Physical Copies ({copies.length})
                      </h4>
                      <Dialog open={addCopyOpen} onOpenChange={setAddCopyOpen}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCopyAccession("");
                              setCopyCondition("NEW");
                              setCopyLocation("");
                              setAddCopyOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Copy
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Copy — {b.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Accession Number *</Label>
                              <Input
                                value={copyAccession}
                                onChange={(e) =>
                                  setCopyAccession(e.target.value)
                                }
                                placeholder="Unique barcode / accession #"
                              />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <Label>Condition</Label>
                                <Select
                                  value={copyCondition}
                                  onValueChange={setCopyCondition}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(
                                      BOOK_COPY_CONDITION_LABELS,
                                    ).map(([val, label]) => (
                                      <SelectItem key={val} value={val}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Location</Label>
                                <Input
                                  value={copyLocation}
                                  onChange={(e) =>
                                    setCopyLocation(e.target.value)
                                  }
                                  placeholder="e.g. A-3-12"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setAddCopyOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleAddCopy}
                                disabled={addingCopy}
                              >
                                {addingCopy && (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                )}
                                Add Copy
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {copiesLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : copies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No copies yet. Add one above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {copies.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-lg border bg-background px-3 py-2"
                          >
                            {editingCopyId === c.id ? (
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                                <span className="w-full shrink-0 font-mono text-sm font-medium sm:w-28">
                                  {c.accessionNumber}
                                </span>
                                <Select
                                  value={editCondition}
                                  onValueChange={setEditCondition}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs sm:w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(
                                      BOOK_COPY_CONDITION_LABELS,
                                    ).map(([val, label]) => (
                                      <SelectItem key={val} value={val}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={editStatus}
                                  onValueChange={setEditStatus}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs sm:w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(
                                      BOOK_COPY_STATUS_LABELS,
                                    ).map(([val, label]) => (
                                      <SelectItem key={val} value={val}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={editLocation}
                                  onChange={(e) =>
                                    setEditLocation(e.target.value)
                                  }
                                  placeholder="Location"
                                  className="h-8 w-full text-xs sm:w-24"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 justify-start sm:justify-center"
                                  disabled={savingCopy}
                                  onClick={() => handleSaveCopy(c.id)}
                                >
                                  {savingCopy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 justify-start sm:justify-center"
                                  onClick={() => setEditingCopyId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                  <span className="font-mono text-sm font-medium">
                                    {c.accessionNumber}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={copyStatusColor(c.status)}
                                  >
                                    {BOOK_COPY_STATUS_LABELS[
                                      c.status as BookCopyStatus
                                    ] || c.status}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {BOOK_COPY_CONDITION_LABELS[
                                      c.condition as BookCopyCondition
                                    ] || c.condition}
                                  </span>
                                  {c.location && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                      <MapPin className="h-3 w-3" />
                                      {c.location}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 flex items-center gap-1 sm:mt-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7"
                                    onClick={() => startEditCopy(c)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  {c.status !== "RETIRED" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-destructive hover:text-destructive"
                                      onClick={() => handleRetireCopy(c.id)}
                                      disabled={retiringCopy === c.id}
                                    >
                                      {retiringCopy === c.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-center gap-2 pt-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    fetchBooks(searchQuery, categoryFilter, p);
                  }}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground flex items-center px-3">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    fetchBooks(searchQuery, categoryFilter, p);
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
