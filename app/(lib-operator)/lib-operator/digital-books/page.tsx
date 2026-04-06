"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  FileText,
  Search,
  Plus,
  Loader2,
  RefreshCw,
  BookOpen,
  Upload,
  FileUp,
  Trash2,
  X,
} from "lucide-react";
import { BOOK_CATEGORY_LABELS } from "@/lib/constants";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

interface DigitalBook {
  id: string;
  bookId: string | null;
  title: string;
  author: string;
  category: string;
  description: string | null;
  coverImageUrl: string | null;
  language: string;
  totalPages: number | null;
  totalChapters: number | null;
  isPublicDomain: boolean;
  contentType: "TEXT" | "PDF" | "SCANNED";
  isbn: string | null;
  status: string;
  createdAt: string;
}

export default function DigitalBooksPage() {
  const [books, setBooks] = useState<DigitalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [formTitle, setFormTitle] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formCategory, setFormCategory] = useState("GENERAL");
  const [formDescription, setFormDescription] = useState("");
  const [formIsbn, setFormIsbn] = useState("");
  const [formLanguage, setFormLanguage] = useState("en");

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
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }, []);

  // ─── Fetch books ───────────────────────────────────────

  const fetchBooks = useCallback(
    async (q?: string, ct?: string, p?: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (q && q.length >= 2) params.set("q", q);
        if (ct && ct !== "ALL") params.set("contentType", ct);
        if (selectedLibrary) params.set("libraryId", selectedLibrary);
        params.set("page", String(p || 1));
        params.set("limit", "30");

        const res = await fetch(`/api/management/library/readable-books?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setBooks(data.books);
        setTotalPages(data.pagination.totalPages);
      } catch {
        toast.error("Failed to load digital books");
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
      fetchBooks(searchQuery, contentTypeFilter, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, contentTypeFilter, fetchBooks, libraryScopeHydrated]);

  // ─── Upload ────────────────────────────────────────────

  function resetUploadForm() {
    setFormTitle("");
    setFormAuthor("");
    setFormCategory("GENERAL");
    setFormDescription("");
    setFormIsbn("");
    setFormLanguage("en");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      "application/pdf",
      "text/plain",
      "text/html",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF, plain text, and HTML files are supported");
      e.target.value = "";
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File is too large (max 50MB)");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);

    // Auto-fill title from filename if empty
    if (!formTitle) {
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      setFormTitle(name);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !formTitle.trim() || !formAuthor.trim()) {
      toast.error("File, title, and author are required");
      return;
    }

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("title", formTitle.trim());
      fd.append("author", formAuthor.trim());
      fd.append("category", formCategory);
      if (formDescription.trim()) fd.append("description", formDescription.trim());
      if (formIsbn.trim()) fd.append("isbn", formIsbn.trim());
      fd.append("language", formLanguage);
      if (selectedLibrary) fd.append("libraryId", selectedLibrary);

      const res = await fetch("/api/management/library/readable-books/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      toast.success(data.message || "Book uploaded successfully");
      setUploadOpen(false);
      resetUploadForm();
      fetchBooks(searchQuery, contentTypeFilter, page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ─── Delete ────────────────────────────────────────────

  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(bookId: string) {
    if (!confirm("Delete this digital book? This cannot be undone.")) return;
    try {
      setDeleting(bookId);
      const res = await fetch(`/api/management/library/readable-books/${bookId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Book deleted");
      fetchBooks(searchQuery, contentTypeFilter, page);
    } catch {
      toast.error("Failed to delete book");
    } finally {
      setDeleting(null);
    }
  }

  // ─── Render ────────────────────────────────────────────

  const contentTypeLabel = (ct: string) => {
    switch (ct) {
      case "PDF": return "PDF";
      case "TEXT": return "Text";
      case "SCANNED": return "Scanned";
      default: return ct;
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6 text-[#d4891a]" />
            Digital Books
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload and manage digital book copies (PDF, text files)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <LibrarySelector
            value={selectedLibrary}
            onChange={setSelectedLibrary}
          />
          <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) resetUploadForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 bg-[#d4891a] hover:bg-[#c07816]">
                <Plus className="h-4 w-4" />
                Upload Book
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload Digital Book</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* File picker */}
                <div className="space-y-1.5">
                  <Label>Book File *</Label>
                  <div
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-[#d4891a]/50 hover:bg-[#d4891a]/5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <>
                        <FileUp className="h-8 w-8 text-[#d4891a]" />
                        <div className="text-center">
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                        >
                          <X className="mr-1 h-3 w-3" /> Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to select a <strong>PDF</strong> or <strong>text file</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">Max 50MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.text,.html,.htm"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Book title"
                  />
                </div>

                {/* Author */}
                <div className="space-y-1.5">
                  <Label>Author *</Label>
                  <Input
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    placeholder="Author name"
                  />
                </div>

                {/* Category & Language row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(BOOK_CATEGORY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <Select value={formLanguage} onValueChange={setFormLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="ta">Tamil</SelectItem>
                        <SelectItem value="te">Telugu</SelectItem>
                        <SelectItem value="kn">Kannada</SelectItem>
                        <SelectItem value="ml">Malayalam</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ISBN */}
                <div className="space-y-1.5">
                  <Label>ISBN (optional)</Label>
                  <Input
                    value={formIsbn}
                    onChange={(e) => setFormIsbn(e.target.value)}
                    placeholder="e.g. 978-0-123456-78-9"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief description of the book"
                    rows={3}
                  />
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile || !formTitle.trim() || !formAuthor.trim()}
                  className="w-full bg-[#d4891a] hover:bg-[#c07816]"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Book
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title, author, or ISBN…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="TEXT">Text</SelectItem>
            <SelectItem value="PDF">PDF</SelectItem>
            <SelectItem value="SCANNED">Scanned</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => fetchBooks(searchQuery, contentTypeFilter, page)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Book List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#d4891a]" />
        </div>
      ) : books.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">No digital books found</p>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="h-4 w-4" /> Upload your first book
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Card key={book.id} className="overflow-hidden">
              <CardContent className="flex items-start gap-4 p-4">
                {/* Cover thumbnail */}
                <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {book.coverImageUrl ? (
                    <img
                      src={book.coverImageUrl}
                      alt={book.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="h-6 w-6 text-muted-foreground/50" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{book.title}</h3>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        book.contentType === "PDF"
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                          : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
                      }
                    >
                      {contentTypeLabel(book.contentType)}
                    </Badge>
                    <Badge variant="secondary">
                      {formatCategoryLabel(book.category)}
                    </Badge>
                    {book.isPublicDomain && (
                      <Badge variant="outline" className="text-xs">Public Domain</Badge>
                    )}
                    {book.totalChapters && (
                      <span className="text-xs text-muted-foreground">
                        {book.totalChapters} ch · {book.totalPages ?? "?"} pg
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {!book.isPublicDomain && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deleting === book.id}
                      onClick={() => handleDelete(book.id)}
                    >
                      {deleting === book.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  fetchBooks(searchQuery, contentTypeFilter, p);
                }}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  fetchBooks(searchQuery, contentTypeFilter, p);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
